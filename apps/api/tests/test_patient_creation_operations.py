"""Private PostgreSQL acceptance: no patient data is printed."""
from concurrent.futures import ThreadPoolExecutor
import os
import threading
import unittest
from unittest.mock import patch
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.core.domain.exceptions import ConflictError, ForbiddenError, ValidationError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PatientCreationOperationsTests(unittest.TestCase):
    def test_transaction_concurrency_scope_replay_and_tombstone(self):
        data = fixture.AppointmentConcurrencyTests()
        self.addCleanup(data.doCleanups)
        data.setUp()
        actor, key = uuid4(), uuid4()
        payload = {'full_name': 'Operation Fictitious', 'cpf': None}
        barrier = threading.Barrier(2, timeout=15)
        def worker():
            with Session(data.engine) as db:
                barrier.wait()
                return SqlAlchemyPatientRepository(db).create(payload,
                    operation_key=key, actor_id=actor).id
        with ThreadPoolExecutor(2) as pool:
            ids = list(pool.map(lambda _: worker(), range(2)))
        self.assertEqual(ids[0], ids[1])
        with Session(data.engine) as db:
            repo = SqlAlchemyPatientRepository(db)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM patient_creation_operations')), 1)
            with self.assertRaises(ConflictError):
                repo.create({**payload, 'notes':'Changed'}, operation_key=key, actor_id=actor)
            with self.assertRaises(ForbiddenError):
                repo.create(payload, operation_key=key, actor_id=actor, allow_replay=False)
            other = repo.create(payload, operation_key=key, actor_id=uuid4())
            self.assertNotEqual(other.id, ids[0])
            original = repo.get(ids[0])
            changed = repo.update(original.id, {'version':original.version, 'notes':'Current value'})
            replay = repo.create(payload, operation_key=key, actor_id=actor)
            self.assertEqual((replay.id,replay.version,replay.notes),(changed.id,changed.version,changed.notes))
            db.execute(text('DELETE FROM patients WHERE id=:id'), {'id':ids[0]})
            db.commit()
            with self.assertRaises(ConflictError) as error:
                repo.create(payload, operation_key=key, actor_id=actor)
            self.assertEqual(error.exception.code,'creation_deleted')
            with self.assertRaises(ValidationError):
                repo.create({**payload,'cpf':'123'}, operation_key=uuid4(), actor_id=actor)
            before = db.scalar(text('SELECT count(*) FROM patients'))
            db.rollback()
            with patch.object(db,'commit',side_effect=RuntimeError('Fictitious commit failure')):
                with self.assertRaises(RuntimeError):
                    repo.create(payload, operation_key=uuid4(), actor_id=actor)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM patients')),before)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM patient_creation_operations')),2)
