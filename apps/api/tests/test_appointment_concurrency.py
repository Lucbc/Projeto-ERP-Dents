"""Deterministic races on independent PostgreSQL connections; fictitious schemas only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
import re
import subprocess
import sys
import threading
import unittest
from uuid import uuid4

from sqlalchemy import create_engine, insert, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from src.adapters.db.models.models import AppointmentModel, DentistModel, PatientModel
from src.adapters.db.repositories.appointment_repository import SqlAlchemyAppointmentRepository
from src.adapters.db.repositories.dentist_repository import SqlAlchemyDentistRepository
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.adapters.db.repositories.procedure_repository import SqlAlchemyProcedureRepository
from src.core.use_cases.appointment_use_cases import AppointmentUseCases
from src.core.domain.entities import AppointmentStatus


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class AppointmentConcurrencyTests(unittest.TestCase):
    def setUp(self):
        url = make_url(os.environ['DATABASE_URL'])
        self.assertEqual(url.database, 'erp_dents_homolog')
        self.schema = 'test_agenda_' + uuid4().hex
        self.root = create_engine(url, hide_parameters=True)
        with self.root.begin() as db: db.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.engine = create_engine(url, hide_parameters=True, connect_args={'options': '-csearch_path='+self.schema})
        self.addCleanup(self.cleanup)
        self.assertEqual(self.migrate('upgrade', 'head').returncode, 0, 'Isolated migration failed')
        self.patients, self.dentists = [uuid4(), uuid4()], [uuid4(), uuid4()]
        with Session(self.engine) as db:
            db.add_all([PatientModel(id=id, full_name='Fictitious Patient') for id in self.patients])
            db.add_all([DentistModel(id=id, full_name='Fictitious Dentist', availability=[
                {'day_of_week': day, 'start_time': '00:00', 'end_time': '23:59'}
                for day in AppointmentUseCases._WEEKDAY_LABELS]) for id in self.dentists])
            db.commit()
        self.start = datetime(2030, 1, 7, 13, tzinfo=timezone.utc)

    def migrate(self, direction, revision):
        return subprocess.run([sys.executable, '-m', 'alembic', direction, revision],
            env={**os.environ, 'PGOPTIONS': '-csearch_path='+self.schema}, capture_output=True)

    def cleanup(self):
        self.engine.dispose()
        assert re.fullmatch(r'test_agenda_[0-9a-f]{32}', self.schema)
        with self.root.begin() as db: db.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.root.dispose()

    def data(self, patient=0, dentist=0, hour=0, status='scheduled'):
        return dict(patient_id=self.patients[patient], dentist_id=self.dentists[dentist],
                    start_at=self.start+timedelta(hours=hour), end_at=self.start+timedelta(hours=hour+1),
                    status=AppointmentStatus(status))

    def insert(self, data):
        with Session(self.engine) as db:
            # Explicit columns and ID only also work on historical schemas without version.
            id = db.scalar(insert(AppointmentModel.__table__).values(**data).returning(AppointmentModel.id))
            db.commit()
            return id

    def race(self, operations, mode='create', legacy=False):
        barrier = threading.Barrier(2, timeout=10)
        def worker(operation):
            with Session(self.engine) as db:
                repo = SqlAlchemyAppointmentRepository(db)
                uc = AppointmentUseCases(repo, SqlAlchemyPatientRepository(db),
                    SqlAlchemyDentistRepository(db), SqlAlchemyProcedureRepository(db))
                if legacy:
                    # Historical schema has no later patient version column.
                    # Reproduce the original free-slot read followed by insert directly.
                    self.assertFalse(repo.has_conflict(self.start, self.start+timedelta(hours=1), self.dentists[0]))
                    barrier.wait()
                    db.execute(insert(AppointmentModel.__table__).values(**operation[0]))
                    db.commit()
                    return 'ok'
                original = getattr(repo, mode)
                def synchronized(*args):
                    # Both use cases have already passed the application overlap checks.
                    barrier.wait()
                    return original(*args)
                setattr(repo, mode, synchronized)
                try:
                    getattr(uc, mode)(*operation)
                    return 'ok'
                except IntegrityError as error:
                    db.rollback()
                    return error.orig.sqlstate
        with ThreadPoolExecutor(max_workers=2) as pool: return sorted(pool.map(worker, operations))

    def test_two_creates_for_same_dentist_after_both_prechecks_pass(self):
        self.assertEqual(self.race([(self.data(),), (self.data(patient=1),)]), ['23P01', 'ok'])

    def test_two_creates_for_same_patient_different_dentists(self):
        self.assertEqual(self.race([(self.data(),), (self.data(dentist=1),)]), ['23P01', 'ok'])

    def test_independent_resources_can_commit_concurrently(self):
        self.assertEqual(self.race([(self.data(),), (self.data(patient=1,dentist=1),)]), ['ok', 'ok'])

    def test_adjacent_intervals_can_commit_concurrently(self):
        self.assertEqual(self.race([(self.data(),), (self.data(hour=1),)]), ['ok', 'ok'])

    def test_two_edits_into_same_slot(self):
        first = self.insert(self.data(hour=2))
        second = self.insert(self.data(patient=1,hour=3))
        target = {'version':1, 'start_at':self.start, 'end_at':self.start+timedelta(hours=1)}
        self.assertEqual(self.race([(first,target.copy()), (second,target.copy())], 'update'), ['23P01', 'ok'])
        with Session(self.engine) as db:
            rows = db.scalars(select(AppointmentModel)).all()
            self.assertEqual(sum(row.start_at == self.start for row in rows), 1)
            self.assertEqual(len(rows), 2)  # Losing edit preserves the original booking.

    def test_two_cancelled_bookings_cannot_both_be_reactivated(self):
        first = self.insert(self.data(status='cancelled'))
        second = self.insert(self.data(patient=1,status='cancelled'))
        self.assertEqual(self.race([(first,{'version':1,'status':'confirmed'}), (second,{'version':1,'status':'scheduled'})], 'update'), ['23P01', 'ok'])

    def test_cancellation_and_deletion_release_slot(self):
        first = self.insert(self.data())
        with Session(self.engine) as db:
            db.get(AppointmentModel, first).status = AppointmentStatus.cancelled
            db.commit()
        second = self.insert(self.data(patient=1))
        with Session(self.engine) as db:
            db.delete(db.get(AppointmentModel, second))
            db.commit()
        self.insert(self.data(patient=1))

    def test_completed_booking_still_blocks_and_timezone_offsets_are_equivalent(self):
        self.insert(self.data(status='completed'))
        data = self.data(patient=1)
        data['start_at'] = data['start_at'].astimezone(timezone(timedelta(hours=-3)))
        data['end_at'] = data['end_at'].astimezone(timezone(timedelta(hours=-3)))
        with self.assertRaises(IntegrityError) as error: self.insert(data)
        self.assertEqual(error.exception.orig.sqlstate, '23P01')

    def test_database_rejects_zero_and_negative_duration_even_when_cancelled(self):
        for delta in (0,-1):
            data = self.data(status='cancelled')
            data['end_at'] = self.start + timedelta(minutes=delta)
            with self.assertRaises(IntegrityError) as error: self.insert(data)
            self.assertEqual(error.exception.orig.sqlstate, '23514')

    def test_upgrade_refuses_existing_conflicts_without_changing_records(self):
        self.assertEqual(self.migrate('downgrade','0011_exam_file_deletions').returncode, 0)
        self.assertEqual(self.race([(self.data(),), (self.data(patient=1),)], legacy=True), ['ok','ok'])
        result = self.migrate('upgrade','head')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b'nenhum dado foi alterado', result.stderr)
        with Session(self.engine) as db:
            self.assertEqual(len(db.scalars(select(AppointmentModel.id)).all()), 2)
            self.assertEqual(db.scalar(text('SELECT version_num FROM alembic_version')), '0011_exam_file_deletions')

    def test_upgrade_preserves_nonconflicting_existing_records(self):
        self.assertEqual(self.migrate('downgrade','0011_exam_file_deletions').returncode, 0)
        first = self.insert(self.data())
        second = self.insert(self.data(hour=1))
        self.assertEqual(self.migrate('upgrade','head').returncode, 0)
        with Session(self.engine) as db:
            self.assertEqual(set(db.scalars(select(AppointmentModel.id))), {first,second})
