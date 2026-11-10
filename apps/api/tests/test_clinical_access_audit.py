"""Access metadata in disposable erp-dents-homolog schemas only."""
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import test_clinical_record_db as fixture
from src.adapters.db.repositories.clinical_record_repository import SqlAlchemyClinicalRecordRepository
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.exceptions import ForbiddenError, NotFoundError, UnauthorizedError, ValidationError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class ClinicalAccessAuditTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.ClinicalRecordDatabaseTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.record = self.fixture.final()

    def read(self, method='get', target=None, **kwargs):
        with Session(self.engine) as db:
            return getattr(SqlAlchemyClinicalRecordRepository(db), method)(
                target or self.record.id, actor_id=self.fixture.actor,
                session_id=self.fixture.session_id, **kwargs)

    def events(self):
        with self.engine.connect() as db:
            return [dict(row) for row in db.execute(text(
                'SELECT * FROM access_audit ORDER BY occurred_at,id')).mappings()]

    def test_three_reads_repeat_and_empty_pages_record_only_metadata(self):
        self.assertEqual(self.events(), [])  # Writes never invoke public read methods.
        self.assertEqual(self.read(), self.record)
        self.assertEqual(self.read('get_for_appointment', self.record.appointment_id), self.record)
        page = self.read('list_for_patient', self.record.patient_id, limit=1, offset=0)
        self.assertEqual(page, {'items': [self.record], 'total': 1})
        self.assertEqual(self.read('list_for_patient', self.record.patient_id, limit=1, offset=1)['items'], [])
        self.assertEqual(self.read(), self.record)
        events = self.events()
        self.assertEqual(len(events), 5)
        self.assertEqual([e['action'] for e in events], ['clinical.record_read',
            'clinical.appointment_read', 'clinical.patient_list', 'clinical.patient_list', 'clinical.record_read'])
        for event in events:
            self.assertEqual(event['actor_id'], self.fixture.actor)
            self.assertEqual(event['patient_id'], self.record.patient_id)
            self.assertIsNotNone(event['occurred_at'].tzinfo)
            self.assertEqual(set(event), {'id','occurred_at','actor_id','action','target_id','patient_id',
                'record_ids','record_versions','returned_count','page_limit','page_offset'})
        self.assertEqual(events[0]['record_ids'], [self.record.id])
        self.assertEqual(events[0]['record_versions'], [self.record.version])
        self.assertEqual(events[3]['returned_count'], 0)
        self.assertEqual(events[3]['record_ids'], [])
        self.assertEqual(events[3]['page_offset'], 1)
        self.assertEqual(self.fixture.scalar('SELECT count(*) FROM clinical_operations'), 2)

    def test_empty_appointment_and_unknown_target_preserve_existing_semantics(self):
        visit = self.fixture.fixture.insert(self.fixture.fixture.data(hour=2))
        self.assertIsNone(self.read('get_for_appointment', visit))
        self.assertIsNone(self.read('get_for_appointment', uuid4()))
        unknown = uuid4()
        self.assertEqual(self.read('list_for_patient', unknown), {'items': [], 'total': 0})
        events = self.events()
        self.assertEqual(events[0]['patient_id'], self.record.patient_id)
        self.assertIsNone(events[1]['patient_id'])
        self.assertEqual(events[2]['patient_id'], unknown)
        self.assertTrue(all(e['returned_count'] == 0 for e in events))
        self.assertEqual(self.read('list_for_patient', self.record.patient_id, offset=2**31),
                         {'items': [], 'total': 1})
        self.assertEqual(self.events()[-1]['page_offset'], 2**31)

    def test_denial_invalid_pagination_and_missing_record_never_record_success(self):
        with self.assertRaises(NotFoundError): self.read(target=uuid4())
        with self.assertRaises(ValidationError): self.read('list_for_patient', self.record.patient_id, limit=101)
        with Session(self.engine) as db:
            with self.assertRaises(UnauthorizedError):
                SqlAlchemyClinicalRecordRepository(db).get(self.record.id,
                    actor_id=self.fixture.actor, session_id=uuid4())
        with self.engine.begin() as db:
            db.execute(text("UPDATE role_permissions SET permissions='{}'::jsonb WHERE role='dentist'"))
        for method, target in [('get',self.record.id), ('get_for_appointment',self.record.appointment_id),
                               ('list_for_patient',self.record.patient_id)]:
            with self.assertRaises(ForbiddenError): self.read(method, target)
        self.assertEqual(self.events(), [])

    def test_insert_and_commit_failure_return_no_content_and_release_transaction(self):
        with self.engine.begin() as db:
            db.execute(text("""CREATE FUNCTION reject_access() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'Fictitious rejection' USING ERRCODE='23514'; END $$;
                CREATE TRIGGER reject_access BEFORE INSERT ON access_audit
                FOR EACH ROW EXECUTE FUNCTION reject_access()"""))
        with self.assertRaises(IntegrityError): self.read()
        self.assertEqual(self.events(), [])
        with self.engine.begin() as db:
            db.execute(text('DROP TRIGGER reject_access ON access_audit; DROP FUNCTION reject_access()'))
        for method, target in [('get',self.record.id), ('get_for_appointment',self.record.appointment_id),
                               ('list_for_patient',self.record.patient_id)]:
            with patch.object(Session, 'commit', side_effect=RuntimeError('Fictitious commit failure')):
                with self.assertRaises(RuntimeError): self.read(method, target)
        self.assertEqual(self.events(), [])
        self.assertEqual(self.read(), self.record)
        self.assertEqual(self.fixture.scalar('SELECT count(*) FROM clinical_operations'), 2)

    def test_guards_shape_and_downgrade_preserve_history(self):
        self.read()
        original = self.events()
        for statement in ('UPDATE access_audit SET action=action', 'DELETE FROM access_audit',
                          'TRUNCATE access_audit'):
            with self.assertRaises(IntegrityError):
                with self.engine.begin() as db: db.execute(text(statement))
        for field, value in (('action', "'clinical.invalid'"), ('record_versions', 'ARRAY[0]::bigint[]'),
                             ('record_ids', "'{}'::uuid[]"), ('page_limit','10'),
                             ('patient_id','NULL'), ('returned_count','0')):
            columns = ['id','occurred_at','actor_id','action','target_id','patient_id','record_ids',
                       'record_versions','returned_count','page_limit','page_offset']
            values = [':id' if col == 'id' else value if col == field else col for col in columns]
            with self.assertRaises(IntegrityError):
                with self.engine.begin() as db:
                    db.execute(text('INSERT INTO access_audit SELECT ' + ','.join(values) + ' FROM access_audit'),
                               {'id':uuid4()})
        result = self.fixture.fixture.migrate('downgrade','0028_patient_audit')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.events(), original)

    def test_revocation_committed_while_read_waits_prevents_content_and_event(self):
        ready, pids = threading.Event(), []
        def attempt():
            with Session(self.engine) as db:
                pids.append(db.scalar(text('SELECT pg_backend_pid()')))
                ready.set()
                with self.assertRaises(ForbiddenError):
                    SqlAlchemyClinicalRecordRepository(db).get(self.record.id,
                        actor_id=self.fixture.actor, session_id=self.fixture.session_id)
        with ThreadPoolExecutor(max_workers=1) as pool:
            with Session(self.engine) as db:
                with SqlAlchemyUserRepository(db).administration_lock():
                    pending = pool.submit(attempt)
                    self.assertTrue(ready.wait(8))
                    deadline = time.monotonic() + 8
                    while not db.scalar(text('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=:pid AND NOT granted)'),
                                        {'pid':pids[0]}):
                        self.assertLess(time.monotonic(), deadline, 'Read did not wait for authorization lock')
                        time.sleep(.02)
                    db.execute(text("UPDATE role_permissions SET permissions='{}'::jsonb WHERE role='dentist'"))
                    db.commit()
            pending.result(timeout=10)
        self.assertEqual(self.events(), [])

    def test_migration_from_0028_preserves_records_and_starts_empty(self):
        self.assertEqual(self.fixture.fixture.migrate('downgrade','0028_patient_audit').returncode, 0)
        with self.engine.connect() as db:
            before = db.scalar(text('SELECT jsonb_agg(to_jsonb(c)) FROM clinical_records c'))
            receipts = db.scalar(text('SELECT jsonb_agg(to_jsonb(c) ORDER BY key) FROM clinical_operations c'))
        self.assertEqual(self.fixture.fixture.migrate('upgrade','head').returncode, 0)
        self.assertEqual(self.events(), [])
        with self.engine.connect() as db:
            self.assertEqual(db.scalar(text('SELECT jsonb_agg(to_jsonb(c)) FROM clinical_records c')), before)
            self.assertEqual(db.scalar(text('SELECT jsonb_agg(to_jsonb(c) ORDER BY key) FROM clinical_operations c')), receipts)

