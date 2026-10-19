"""Application CPF assignment races; private PostgreSQL schemas and fictitious data."""
from concurrent.futures import ThreadPoolExecutor
import os
import threading
import time
import unittest
from sqlalchemy import select, text
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.models.models import PatientModel
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.core.domain.exceptions import ConflictError, ValidationError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PatientCpfGuardTests(unittest.TestCase):
    def setUp(self):
        self.data = fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.data.doCleanups)
        self.data.setUp()

    def test_inactive_blocks_create_and_update_without_changes(self):
        with Session(self.data.engine) as db:
            repo = SqlAlchemyPatientRepository(db)
            owner = repo.create(dict(full_name='Inactive Fictitious', cpf='123.456.789-09', active=False))
            other = repo.create(dict(full_name='Other Fictitious'))
            for operation in (
                lambda: repo.create(dict(full_name='New Fictitious', cpf='12345678909')),
                lambda: repo.update(other.id, dict(version=other.version, cpf='12345678909', notes='Should not persist')),
            ):
                with self.assertRaises(ConflictError) as error:
                    operation()
                self.assertEqual(error.exception.code, 'duplicate_cpf')
                self.assertFalse(db.in_transaction())
            saved = repo.get(other.id)
            self.assertEqual((saved.version, saved.cpf, saved.notes), (other.version, None, None))
            self.assertEqual(repo.get(owner.id).cpf, owner.cpf)
            fixed = repo.update(other.id, dict(version=other.version, cpf='98765432100', notes='Corrected'))
            self.assertEqual(fixed.version, other.version + 1)

    def test_format_validation_preserves_history_and_rejects_partial_writes(self):
        with Session(self.data.engine) as db:
            legacy = PatientModel(full_name='Legacy Format Fictitious', cpf='OLD-DOCUMENT')
            db.add(legacy)
            db.commit()
            repo = SqlAlchemyPatientRepository(db)
            original = repo.get(legacy.id)
            for value in ('123', 'DOC-456', '123456789012', '00000000000', '12345678901'):
                with self.assertRaises(ValidationError):
                    repo.create(dict(full_name='Rejected Fictitious', cpf=value))
                with self.assertRaises(ValidationError):
                    repo.update(original.id, dict(version=original.version, cpf=value, notes='Must not persist'))
                self.assertFalse(db.in_transaction())
                saved = repo.get(original.id)
                self.assertEqual((saved.cpf, saved.notes, saved.version), (original.cpf, None, original.version))
            saved = repo.update(original.id, dict(version=original.version, cpf=original.cpf, notes='Kept history'))
            saved = repo.update(saved.id, dict(version=saved.version, cpf=None))
            self.assertIsNone(saved.cpf)
            saved = repo.update(saved.id, dict(version=saved.version, cpf='12345678909'))
            self.assertEqual(saved.cpf, '12345678909')
            with self.assertRaises(ConflictError):
                repo.update(saved.id, dict(version=original.version, cpf='OLD-DOCUMENT'))

    def test_legacy_duplicates_and_absent_cpf_remain_editable(self):
        with Session(self.data.engine) as db:
            legacy = [PatientModel(full_name='Legacy Fictitious', cpf=value)
                      for value in ('123.456.789-09', '12345678909', 'OLD-DOCUMENT')]
            db.add_all(legacy)
            db.commit()
            ids = [row.id for row in legacy]
            repo = SqlAlchemyPatientRepository(db)
            for patient_id in ids:
                original = repo.get(patient_id)
                saved = repo.update(patient_id, dict(version=original.version, cpf=original.cpf, notes='Only notes'))
                self.assertEqual(saved.cpf, original.cpf)
            original = repo.get(ids[0])
            reformatted = repo.update(original.id, dict(version=original.version, cpf='123 456 789 09'))
            self.assertEqual(reformatted.cpf, '123 456 789 09')
            for _ in range(2):
                self.assertIsNone(repo.create(dict(full_name='Same Name Fictitious', cpf=None)).cpf)

    def race(self, first_mode, second_mode, rollback=False):
        acquired, release, second_ready = threading.Event(), threading.Event(), threading.Event()
        state = {}
        def worker(index, mode):
            with Session(self.data.engine) as db:
                self.assertEqual(db.scalar(text('SHOW transaction_isolation')), 'read committed')
                state[index] = db.scalar(text('SELECT pg_backend_pid()'))
                repo = SqlAlchemyPatientRepository(db)
                guard = repo._guard_cpf
                def controlled(key, patient_id=None):
                    if index == 2:
                        second_ready.set()
                    guard(key, patient_id)
                    if index == 1:
                        acquired.set()
                        if not release.wait(15):
                            raise RuntimeError('Timed out releasing fictional writer')
                        if rollback:
                            raise RuntimeError('Fictitious rollback')
                repo._guard_cpf = controlled
                try:
                    payload = dict(cpf='123.456.789-09' if index == 1 else '12345678909')
                    if mode == 'create':
                        repo.create(dict(full_name='Concurrent Fictitious', **payload))
                    else:
                        repo.update(self.data.patients[index - 1], dict(version=1, **payload))
                    return 'saved'
                except ConflictError as error:
                    return error.code
                except RuntimeError:
                    if not rollback:
                        raise
                    return 'rolled_back'
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(worker, 1, first_mode)
            try:
                self.assertTrue(acquired.wait(10))
                second = pool.submit(worker, 2, second_mode)
                self.assertTrue(second_ready.wait(10))
                waiting = False
                for _ in range(100):
                    with self.data.root.connect() as connection:
                        blockers = connection.scalar(text('SELECT pg_blocking_pids(:pid)'), {'pid': state[2]})
                    if state[1] in blockers:
                        waiting = True
                        break
                    time.sleep(.02)
                self.assertTrue(waiting, 'Second writer must wait for first transaction')
            finally:
                release.set()
            results = [first.result(15), second.result(15)]
        self.assertEqual(results, ['rolled_back', 'saved'] if rollback else ['saved', 'duplicate_cpf'])
        with Session(self.data.engine) as db:
            rows = db.scalars(select(PatientModel).where(PatientModel.cpf.is_not(None))).all()
            self.assertEqual(len(rows), 1)

    def test_two_creations_serialize(self):
        self.race('create', 'create')

    def test_creation_and_edit_serialize(self):
        self.race('create', 'update')

    def test_two_edits_serialize(self):
        self.race('update', 'update')

    def test_rollback_releases_cpf_for_waiting_writer(self):
        self.race('create', 'create', rollback=True)

    def test_stale_version_cannot_restore_previous_cpf(self):
        with Session(self.data.engine) as db:
            repo = SqlAlchemyPatientRepository(db)
            patient = repo.create(dict(full_name='Stale Fictitious', cpf='12345678909'))
            current = repo.update(patient.id, dict(version=patient.version, cpf=None))
            repo.create(dict(full_name='New Owner Fictitious', cpf='12345678909'))
            with self.assertRaises(ConflictError) as error:
                repo.update(patient.id, dict(version=patient.version, cpf='12345678909'))
            self.assertNotEqual(error.exception.code, 'duplicate_cpf')
            self.assertEqual(repo.get(patient.id).version, current.version)
            self.assertIsNone(repo.get(patient.id).cpf)
