"""Patient edit audit in private migrated PostgreSQL schemas, fictional data only."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from threading import Barrier
import unittest
from unittest.mock import patch
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.core.use_cases.patient_use_cases import PatientUseCases
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ConflictError, ValidationError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PatientAuditTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.patient = self.fixture.patients[0]
        with Session(self.engine) as db:
            self.actor = SqlAlchemyUserRepository(db).create(dict(name='Fictitious Actor',
                email=uuid4().hex+'@example.com', role=UserRole.reception,
                password_hash='fictitious-unused-hash')).id

    def uc(self, db):
        return PatientUseCases(fixture.SqlAlchemyPatientRepository(db))

    def events(self):
        with self.engine.connect() as db:
            return list(db.execute(text('SELECT * FROM patient_audit ORDER BY after_version')).mappings())

    def test_normalization_null_omission_noop_and_metadata_only(self):
        with Session(self.engine) as db:
            self.uc(db).update(self.patient, dict(version=1, notes='  Fictitious private note  ', active=False), actor_id=self.actor)
            self.uc(db).update(self.patient, dict(version=2, notes='Fictitious private note'), actor_id=self.actor)
            self.uc(db).update(self.patient, dict(version=3, notes=None), actor_id=self.actor)
        events = self.events()
        self.assertEqual([set(e['changed_fields']) for e in events], [{'notes','active'}, set(), {'notes'}])
        self.assertEqual([(e['before_version'],e['after_version']) for e in events], [(1,2),(2,3),(3,4)])
        self.assertTrue(all(e['actor_id'] == self.actor and e['patient_id'] == self.patient for e in events))
        self.assertNotIn('Fictitious', json.dumps([dict(e) for e in events], default=str))

    def test_failure_after_event_insert_rolls_back_patient_and_event(self):
        with Session(self.engine) as db:
            original = db.execute
            def fail(statement, *args, **kwargs):
                result = original(statement, *args, **kwargs)
                if 'INSERT INTO patient_audit' in str(statement):
                    raise RuntimeError('Fictitious write failure')
                return result
            with patch.object(db, 'execute', side_effect=fail):
                with self.assertRaises(RuntimeError):
                    self.uc(db).update(self.patient, dict(version=1, notes='Fictitious change'), actor_id=self.actor)
            patient = self.uc(db).get(self.patient)
            self.assertEqual(patient.version, 1)
            self.assertIsNone(patient.notes)
        self.assertEqual(self.events(), [])

    def test_concurrent_edits_record_only_winner(self):
        gate = Barrier(2, timeout=15)
        def worker(value):
            with Session(self.engine) as db:
                gate.wait()
                try:
                    self.uc(db).update(self.patient, dict(version=1, notes=value), actor_id=self.actor)
                    return 'ok'
                except ConflictError:
                    return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(worker, ['Fictitious A','Fictitious B'])), ['conflict','ok'])
        self.assertEqual(len(self.events()), 1)

    def test_invalid_stale_and_duplicate_cpf_do_not_record_success(self):
        with Session(self.engine) as db:
            other = self.fixture.patients[1]
            self.uc(db).update(other, dict(version=1, cpf='52998224725', active=False))
            with self.assertRaises(ConflictError):
                self.uc(db).update(self.patient, dict(version=1, cpf='52998224725'), actor_id=self.actor)
            with self.assertRaises(ValidationError):
                self.uc(db).update(self.patient, dict(version=1, cpf='123'), actor_id=self.actor)
            self.uc(db).update(self.patient, dict(version=1), actor_id=self.actor)
            with self.assertRaises(ConflictError):
                self.uc(db).update(self.patient, dict(version=1, notes='Fictitious stale'), actor_id=self.actor)
        self.assertEqual(len(self.events()), 1)
        self.assertEqual(self.events()[0]['changed_fields'], [])

    def test_immutable_and_preserved_after_target_deletion(self):
        with Session(self.engine) as db:
            self.uc(db).update(self.patient, dict(version=1), actor_id=self.actor)
            db.execute(text('DELETE FROM patients WHERE id=:id'), {'id':self.patient})
            db.execute(text('DELETE FROM users WHERE id=:id'), {'id':self.actor})
            db.commit()
        for sql in ('UPDATE patient_audit SET action=action', 'DELETE FROM patient_audit', 'TRUNCATE patient_audit'):
            with self.engine.begin() as db:
                with self.assertRaises(Exception):
                    db.execute(text(sql))
        self.assertEqual(len(self.events()), 1)
        self.assertNotEqual(self.fixture.migrate('downgrade', '0027_administrative_audit').returncode, 0)

    def test_migration_preserves_existing_patients_without_backfill(self):
        self.assertEqual(self.fixture.migrate('downgrade','0027_administrative_audit').returncode,0)
        with self.engine.connect() as db:
            before = list(db.scalars(text('SELECT to_jsonb(p)::text FROM patients p ORDER BY id')))
        self.assertEqual(self.fixture.migrate('upgrade','head').returncode,0)
        with self.engine.connect() as db:
            self.assertEqual(list(db.scalars(text('SELECT to_jsonb(p)::text FROM patients p ORDER BY id'))),before)
        self.assertEqual(self.events(), [])

    def test_concurrent_cpf_assignment_records_only_winner(self):
        gate = Barrier(2, timeout=15)
        def worker(patient):
            with Session(self.engine) as db:
                gate.wait()
                try:
                    self.uc(db).update(patient, dict(version=1, cpf='52998224725'), actor_id=self.actor)
                    return 'ok'
                except ConflictError:
                    return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(worker, self.fixture.patients)), ['conflict','ok'])
        self.assertEqual(len(self.events()),1)
        self.assertEqual(self.events()[0]['changed_fields'], ['cpf'])
