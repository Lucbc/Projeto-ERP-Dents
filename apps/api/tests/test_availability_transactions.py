"""Availability writes and reservations coordinate in isolated PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier, Event
from unittest.mock import patch
import os
import time
import unittest
from uuid import uuid4

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.models.models import AppointmentModel, DentistModel, ProcedureModel
from src.adapters.db.repositories.dentist_repository import SqlAlchemyDentistRepository
from src.core.domain.exceptions import ConflictError
from src.core.domain.availability import requires_booking_validation, same_availability


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class AvailabilityTransactionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.now = self.fixture.start - timedelta(minutes=30)
        self.clock = patch.object(SqlAlchemyDentistRepository, '_now', lambda repo: self.now)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def uc(self, db):
        return fixture.AppointmentUseCases(fixture.SqlAlchemyAppointmentRepository(db),
            fixture.SqlAlchemyPatientRepository(db), SqlAlchemyDentistRepository(db),
            fixture.SqlAlchemyProcedureRepository(db))

    def reset(self):
        with Session(self.engine) as db:
            db.execute(delete(AppointmentModel))
            for dentist in db.scalars(select(DentistModel)):
                dentist.active = True
                dentist.version = 1
                dentist.availability = [{'day_of_week': day, 'start_time': '00:00', 'end_time': '23:59'}
                                        for day in fixture.AppointmentUseCases._WEEKDAY_LABELS]
            db.commit()

    def target(self, mode):
        if mode == 'create': return None
        data = self.fixture.data(status='cancelled' if mode == 'reactivate' else 'scheduled')
        if mode == 'move':
            data['start_at'] -= timedelta(days=730)
            data['end_at'] -= timedelta(days=730)
        return self.fixture.insert(data)

    def reserve(self, uc, mode, id):
        if mode == 'create': return uc.create(self.fixture.data())
        return uc.update(id, {**self.fixture.data(), 'version': 1})

    def test_dentist_commits_first_all_six_operations_revalidate_and_rollback(self):
        for mode in ('create', 'move', 'reactivate'):
            for change in ({'availability': []}, {'active': False}):
                with self.subTest(mode=mode, change=change):
                    self.reset()
                    id = self.target(mode)
                    with Session(self.engine) as db:
                        uc = self.uc(db)
                        repo = uc.appointment_repository
                        method = 'create' if mode == 'create' else 'update'
                        original = getattr(repo, method)
                        def after_precheck(*args):
                            with Session(self.engine) as other:
                                SqlAlchemyDentistRepository(other).update(self.fixture.dentists[0], {'version': 1, **change})
                            return original(*args)
                        setattr(repo, method, after_precheck)
                        with self.assertRaises(ConflictError) as error: self.reserve(uc, mode, id)
                        self.assertEqual(error.exception.code, 'availability_conflict')
                        self.assertFalse(db.in_transaction())
                    with Session(self.engine) as db:
                        rows = db.scalars(select(AppointmentModel)).all()
                        self.assertEqual(len(rows), 0 if mode == 'create' else 1)
                        if rows: self.assertEqual(rows[0].version, 1)

    def test_reservation_commits_first_blocks_both_incompatible_changes(self):
        for mode in ('create', 'move', 'reactivate'):
            compatible_hours = [{'day_of_week': 'monday', 'start_time': '09:00', 'end_time': '12:00'}]
            for change in ({'availability': []}, {'active': False}, {'availability': compatible_hours}):
                with self.subTest(mode=mode, change=change):
                    compatible = change.get('availability') == compatible_hours
                    self.reset()
                    id = self.target(mode)
                    locked, release, attempting = Event(), Event(), Event()
                    pid = []
                    def reserve():
                        with Session(self.engine) as db:
                            uc = self.uc(db)
                            original = uc.appointment_repository._validate_booking
                            def paused(*args):
                                original(*args); locked.set()
                                if not release.wait(10): raise AssertionError('Reservation release timed out')
                            uc.appointment_repository._validate_booking = paused
                            return self.reserve(uc, mode, id)
                    def change_dentist():
                        with Session(self.engine) as db:
                            pid.append(db.scalar(text('select pg_backend_pid()'))); attempting.set()
                            try:
                                SqlAlchemyDentistRepository(db).update(self.fixture.dentists[0], {'version': 1, **change})
                            except ConflictError as error:
                                self.assertFalse(db.in_transaction())
                                return error.code
                            return 'ok'
                    with ThreadPoolExecutor(max_workers=2) as pool:
                        booking = pool.submit(reserve)
                        try:
                            self.assertTrue(locked.wait(10))
                            dentist = pool.submit(change_dentist)
                            self.assertTrue(attempting.wait(10))
                            deadline = time.monotonic() + 5
                            waiting = False
                            while time.monotonic() < deadline:
                                with self.engine.connect() as observer:
                                    waiting = bool(observer.scalar(text('select cardinality(pg_blocking_pids(:pid))'), {'pid': pid[0]}))
                                if waiting: break
                                time.sleep(.02)
                            self.assertTrue(waiting, 'Dentist update must wait for reservation transaction')
                        finally:
                            release.set()
                        booking.result(timeout=10)
                        self.assertEqual(dentist.result(timeout=10), 'ok' if compatible else 'availability_conflict')
                    with Session(self.engine) as db:
                        self.assertEqual(db.get(DentistModel, self.fixture.dentists[0]).version, 2 if compatible else 1)

    def test_current_ongoing_and_future_bookings_block_but_history_does_not(self):
        for status in ('scheduled', 'confirmed', 'completed', 'cancelled'):
            for end_offset in (-1, 0, 1, 3600):
                with self.subTest(status=status, end_offset=end_offset):
                    self.reset()
                    data = self.fixture.data(status=status)
                    data['end_at'] = self.now + timedelta(seconds=end_offset)
                    data['start_at'] = data['end_at'] - timedelta(hours=1)
                    self.fixture.insert(data)
                    with Session(self.engine) as db:
                        repo = SqlAlchemyDentistRepository(db)
                        if status in ('scheduled', 'confirmed') and end_offset > 0:
                            with self.assertRaises(ConflictError): repo.update(self.fixture.dentists[0], {'version': 1, 'active': False})
                        else:
                            self.assertFalse(repo.update(self.fixture.dentists[0], {'version': 1, 'active': False}).active)

    def test_legacy_maintenance_cancellation_and_reopening_matrix(self):
        id = self.fixture.insert(self.fixture.data())
        with Session(self.engine) as db:
            dentist = db.get(DentistModel, self.fixture.dentists[0])
            dentist.active = False  # Fictitious pre-existing inconsistent legacy record.
            db.commit()
            uc = self.uc(db)
            result = uc.update(id, {'version': 1, 'notes': 'Fictitious maintenance', 'status': 'confirmed'})
            result = uc.update(id, {'version': result.version, 'status': 'completed'})
            with self.assertRaises(ConflictError): uc.update(id, {'version': result.version, 'status': 'scheduled'})
            result = uc.update(id, {'version': result.version, 'status': 'cancelled'})
            with self.assertRaises(ConflictError): uc.update(id, {'version': result.version, 'status': 'confirmed'})
            saved = SqlAlchemyDentistRepository(db).update(self.fixture.dentists[0], {'version': 1, 'phone': 'Fictitious'})
            self.assertEqual(saved.version, 2)

    def test_stale_orm_is_refreshed_and_compatible_changes_remain_possible(self):
        with Session(self.engine) as db:
            stale = db.get(DentistModel, self.fixture.dentists[0])
            with Session(self.engine) as other:
                SqlAlchemyDentistRepository(other).update(stale.id, {'version': 1, 'availability': []})
            with self.assertRaises(ConflictError): self.uc(db).appointment_repository.create(self.fixture.data())
            self.assertEqual(SqlAlchemyDentistRepository(db).get(stale.id).availability, [])
        self.reset()
        self.fixture.insert(self.fixture.data())
        with Session(self.engine) as db:
            repo = SqlAlchemyDentistRepository(db)
            updated = repo.update(self.fixture.dentists[0], {'version': 1, 'availability': [
                {'day_of_week': 'monday', 'start_time': '09:00', 'end_time': '12:00'}]})
            self.assertEqual(updated.version, 2)
            self.assertEqual(repo.update(updated.id, {'version': 2, 'phone': 'Fictitious'}).version, 3)

    def test_failed_rebooking_preserves_version_fields_and_procedure_links(self):
        id = self.fixture.insert(self.fixture.data())
        procedure = uuid4()
        with Session(self.engine) as db:
            db.add(ProcedureModel(id=procedure, name='Fictitious', price_cents=100)); db.commit()
            uc = self.uc(db)
            uc.update(id, {'version': 1, 'procedure_ids': [procedure], 'notes': 'Original'})
            # Direct fixture mutation to reproduce a historical invalid reservation.
            db.get(DentistModel, self.fixture.dentists[0]).availability = []; db.commit()
            with self.assertRaises(ConflictError):
                uc.appointment_repository.update(id, {'version': 2, 'start_at': self.fixture.start + timedelta(minutes=1),
                    'procedure_ids': [], 'notes': 'Rejected'})
            saved = uc.get(id)
            self.assertEqual((saved.version, saved.notes, saved.procedure_ids), (2, 'Original', [procedure]))

    def test_opposite_dentist_moves_commit_without_global_lock(self):
        first = self.fixture.insert(self.fixture.data())
        second = self.fixture.insert(self.fixture.data(patient=1, dentist=1, hour=2))
        barrier = Barrier(2, timeout=10)
        def move(args):
            id, dentist = args
            with Session(self.engine) as db:
                uc = self.uc(db)
                original = uc.appointment_repository._lock_dentists
                def synchronized(ids):
                    result = original(ids)
                    barrier.wait()
                    return result
                uc.appointment_repository._lock_dentists = synchronized
                return uc.update(id, {'version': 1, 'dentist_id': dentist}).version
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(move, [(first, self.fixture.dentists[1]), (second, self.fixture.dentists[0])])), [2, 2])

    def test_status_matrix_only_reopens_or_changed_anchors_reserve_again(self):
        from types import SimpleNamespace
        first = {'day_of_week': 'monday', 'start_time': '08:00', 'end_time': '12:00'}
        second = {**first, 'day_of_week': 'tuesday'}
        self.assertTrue(same_availability([first, second], [second, first, first]))
        self.assertFalse(same_availability([first], [second]))
        for old in ('scheduled', 'confirmed', 'completed', 'cancelled'):
            current = SimpleNamespace(**self.fixture.data(status=old))
            for new in ('scheduled', 'confirmed', 'completed', 'cancelled'):
                expected = new != 'cancelled' and (old == 'cancelled' or (old == 'completed' and new in ('scheduled', 'confirmed')))
                self.assertEqual(requires_booking_validation(current, {'status': new}), expected)
