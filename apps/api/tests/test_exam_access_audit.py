"""Real authorization/transactions with controlled scanner timing in private schemas."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import test_clinical_record_db as fixture
from src.api.routers import exams_router
from src.core.domain.exceptions import ForbiddenError, UnauthorizedError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class ExamAccessAuditTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.ClinicalRecordDatabaseTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        folder = TemporaryDirectory(prefix='erp-exam-audit-')
        self.addCleanup(folder.cleanup)
        self.path = Path(folder.name) / 'fictional.bin'
        self.path.write_bytes(b'Fictitious exam bytes')
        self.exam = SimpleNamespace(id=uuid4(), patient_id=self.fixture.fixture.patients[0],
                                    original_filename='Fictitious private filename.bin')
        self.opened = []

    def route(self, after_scan=lambda: None):
        def scan(stream):
            self.opened.append(stream)
            after_scan()
        with Session(self.engine) as db, \
             patch.object(exams_router, 'build_use_case', return_value=SimpleNamespace(
                 get_download=lambda _: (self.exam,self.path))), \
             patch.object(exams_router.ClamAVScanner, 'scan', side_effect=scan):
            response = exams_router.download_exam(self.exam.id, db,
                SimpleNamespace(id=self.fixture.actor), self.fixture.session_id)
            self.assertFalse(db.in_transaction())
            self.addCleanup(response.stream.close)
            return response

    def events(self):
        with self.engine.connect() as db:
            return [dict(row) for row in db.execute(text('SELECT * FROM access_audit')).mappings()]

    def test_prepared_event_commits_without_content_and_without_stream_locks(self):
        def check_unlocked():
            with self.engine.begin() as db:
                db.execute(text('LOCK TABLE users IN ACCESS EXCLUSIVE MODE NOWAIT'))
        response = self.route(check_unlocked)
        check_unlocked()  # Slow client has not consumed the response yet.
        self.assertFalse(response.stream.closed)
        event, = self.events()
        self.assertEqual(event['actor_id'], self.fixture.actor)
        self.assertEqual(event['action'], 'exam.download_prepared')
        self.assertEqual(event['target_id'], self.exam.id)
        self.assertEqual(event['patient_id'], self.exam.patient_id)
        self.assertEqual(event['record_ids'], [])
        self.assertEqual(event['record_versions'], [])
        self.assertEqual(event['returned_count'], 0)
        self.assertIsNone(event['page_limit'])
        self.assertIsNone(event['page_offset'])
        self.assertNotIn('Fictitious', str(event))

    def assert_revoked(self, statement, error):
        # Independent transaction executes while scanner callback is running.
        def revoke():
            with self.engine.begin() as db: db.execute(text(statement))
        with self.assertRaises(error): self.route(revoke)
        self.assertTrue(self.opened[-1].closed)
        self.assertEqual(self.events(), [])

    def test_permission_revoked_during_scan(self):
        self.assert_revoked("UPDATE role_permissions SET permissions=jsonb_set(permissions::jsonb,'{exams,view}','false') WHERE role='dentist'", ForbiddenError)

    def test_logout_during_scan(self):
        self.assert_revoked('DELETE FROM auth_sessions', UnauthorizedError)

    def test_inactivation_during_scan(self):
        self.assert_revoked('UPDATE users SET is_active=false', UnauthorizedError)

    def test_insert_and_commit_failures_close_stream_and_never_return_response(self):
        with self.engine.begin() as db:
            db.execute(text("""CREATE FUNCTION reject_exam_access() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'Fictitious failure' USING ERRCODE='23514'; END $$;
                CREATE TRIGGER reject_exam_access BEFORE INSERT ON access_audit
                FOR EACH ROW EXECUTE FUNCTION reject_exam_access()"""))
        with self.assertRaises(IntegrityError): self.route()
        self.assertTrue(self.opened[-1].closed)
        self.assertEqual(self.events(), [])
        with self.engine.begin() as db:
            db.execute(text('DROP TRIGGER reject_exam_access ON access_audit; DROP FUNCTION reject_exam_access()'))
        with patch.object(Session,'commit',side_effect=RuntimeError('Fictitious commit failure')):
            with self.assertRaises(RuntimeError): self.route()
        self.assertTrue(self.opened[-1].closed)
        self.assertEqual(self.events(), [])
        self.route()
        self.assertEqual(len(self.events()), 1)

    def test_upgrade_preserves_clinical_event_and_download_blocks_downgrade(self):
        self.assertEqual(self.fixture.fixture.migrate('downgrade','0029_access_audit').returncode,0)
        record = self.fixture.final()
        from src.adapters.db.repositories.clinical_record_repository import SqlAlchemyClinicalRecordRepository
        with Session(self.engine) as db:
            SqlAlchemyClinicalRecordRepository(db).get(record.id, actor_id=self.fixture.actor,
                                                        session_id=self.fixture.session_id)
        before = self.events()
        self.assertEqual(self.fixture.fixture.migrate('upgrade','head').returncode,0)
        self.assertEqual(self.events(),before)
        self.route()
        self.assertNotEqual(self.fixture.fixture.migrate('downgrade','0029_access_audit').returncode,0)
        self.assertEqual(len(self.events()),2)
