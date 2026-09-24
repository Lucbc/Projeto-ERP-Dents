"""Exams: real DB commits, disposable filesystem, and bounded ASGI uploads."""
import asyncio
import base64
import io
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.orm import Session

from test_auth_sessions import HomologDatabaseTests
from src.adapters.db.exam_cleanup import process_exam_deletions, queue_exam_file
from src.adapters.db.models.models import ExamFileDeletionModel
from src.adapters.db.repositories.exam_repository import SqlAlchemyExamRepository
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.adapters.storage.filesystem_exam_storage import FileSystemExamStorage
from src.api.upload_limit import ExamUploadLimitMiddleware
from src.core.domain.exceptions import ValidationError, PayloadTooLargeError, StorageUnavailableError, ConflictError
from src.core.use_cases.exam_use_cases import ExamUseCases

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=")


class ExamFixture(HomologDatabaseTests):
    def setUp(self):
        super().setUp()
        self.directory = tempfile.TemporaryDirectory(prefix="erp-exam-test-")
        self.addCleanup(self.directory.cleanup)
        settings = SimpleNamespace(exams_base_path=self.directory.name, exam_max_bytes=1024)
        with patch("src.adapters.storage.filesystem_exam_storage.get_settings", return_value=settings):
            self.storage = FileSystemExamStorage()
        self.patients = SqlAlchemyPatientRepository(self.db)
        self.patient = self.patients.create({"full_name": "Fictitious Exam Patient"})
        self.exams = SqlAlchemyExamRepository(self.db)
        self.exams_uc = ExamUseCases(self.exams, self.patients, self.storage, max_bytes=1024)

    def upload(self, content=PNG, name="test.png", mime="text/html"):
        return self.exams_uc.upload(self.patient.id, name, mime, io.BytesIO(content), None)

    def files(self):
        return [p for p in Path(self.directory.name).rglob("*") if p.is_file()]


class ExamTests(ExamFixture):
    def test_detected_mime_and_sanitized_name_preserve_original_bytes(self):
        exam = self.upload(name="C:\\fakepath\\test.png")
        self.assertEqual(exam.original_filename, "test.png")
        self.assertEqual(exam.mime_type, "image/png")
        self.assertEqual(self.exams_uc.get_download(exam.id)[1].read_bytes(), PNG)

    def test_invalid_empty_oversized_or_active_formats_leave_no_files(self):
        for body, name, error in ((b"", "test.png", ValidationError),
                (b"x" * 1025, "test.png", PayloadTooLargeError),
                (b"<script>alert(1)</script>", "test.png", ValidationError),
                (PNG, "test.html", ValidationError), (b"<svg/>", "test.svg", ValidationError),
                (PNG[:16], "test.png", ValidationError)):
            with self.subTest(name=name, size=len(body)), self.assertRaises(error): self.upload(body, name)
        self.assertEqual(self.files(), [])

    def test_path_traversal_is_rejected(self):
        for name in ("../../outside", "/tmp/outside", "..\\outside"):
            with self.assertRaises(ValueError): self.storage.get_file_path(self.patient.id, name)

    def test_failed_upload_commit_removes_unreferenced_file(self):
        with patch.object(self.db, "commit", side_effect=RuntimeError("simulated failure")):
            with self.assertRaises(RuntimeError): self.upload()
        self.assertEqual(self.files(), [])
        self.assertEqual(self.exams.list_by_patient(self.patient.id), [])

    def test_patient_deleted_during_upload_causes_conflict_and_compensation(self):
        original = self.storage.save_file
        def concurrent_delete(*args):
            filename = original(*args)
            with Session(self.engine) as other:
                repo = SqlAlchemyPatientRepository(other)
                preview = repo.deletion_preview(self.patient.id, 1, can_delete_exams=True)
                repo.delete(self.patient.id, 1, preview['exams_fingerprint'], can_delete_exams=True)
            return filename
        with patch.object(self.storage, "save_file", side_effect=concurrent_delete), self.assertRaises(ConflictError):
            self.upload()
        self.assertEqual(self.files(), [])

    def test_ambiguous_successful_commit_never_removes_referenced_file(self):
        original = self.exams.create
        def fail_after_commit(data):
            original(data)
            raise RuntimeError("connection lost after commit")
        with patch.object(self.exams, "create", side_effect=fail_after_commit), self.assertRaises(RuntimeError):
            self.upload()
        self.assertEqual(len(self.files()), 1)
        self.assertEqual(len(self.exams.list_by_patient(self.patient.id)), 1)

    def test_low_disk_and_stream_limit_leave_no_partial_file(self):
        with patch("shutil.disk_usage", return_value=SimpleNamespace(free=0)), self.assertRaises(StorageUnavailableError):
            self.upload()
        with self.assertRaises(PayloadTooLargeError):
            self.storage.save_file(self.patient.id, "test.png", io.BytesIO(b"x" * 1025))
        self.assertEqual(self.files(), [])

    def test_failed_delete_commit_preserves_metadata_and_file(self):
        exam = self.upload()
        with patch.object(self.db, "commit", side_effect=RuntimeError("simulated failure")):
            with self.assertRaises(RuntimeError): self.exams_uc.delete(exam.id)
        self.assertIsNotNone(self.exams.get(exam.id))
        self.assertEqual(len(self.files()), 1)
        self.assertEqual(list(self.db.scalars(select(ExamFileDeletionModel))), [])

    def test_cleanup_failure_persists_and_retry_from_new_connection_succeeds(self):
        exam = self.upload()
        self.exams_uc.delete(exam.id)
        with patch.object(self.storage, "delete_file", side_effect=OSError("disk unavailable")):
            self.assertEqual(process_exam_deletions(self.db, self.storage)["pending_failures"], 1)
        self.assertEqual(len(self.files()), 1)
        with Session(self.engine) as db:
            self.assertEqual(process_exam_deletions(db, self.storage)["removed"], 1)
        self.assertEqual(self.files(), [])

    def test_patient_deletion_queues_all_exam_files(self):
        self.upload()
        self.upload()
        preview = self.patients.deletion_preview(self.patient.id, 1, can_delete_exams=True)
        self.patients.delete(self.patient.id, 1, preview['exams_fingerprint'], can_delete_exams=True)
        self.assertEqual(len(self.files()), 2)
        self.assertEqual(len(list(self.db.scalars(select(ExamFileDeletionModel)))), 2)
        self.assertEqual(process_exam_deletions(self.db, self.storage)["removed"], 2)
        self.assertEqual(self.files(), [])

    def test_cleanup_never_deletes_still_referenced_file(self):
        exam = self.upload()
        queue_exam_file(self.db, exam.patient_id, exam.stored_filename)
        self.db.commit()
        self.assertEqual(process_exam_deletions(self.db, self.storage)["pending_failures"], 1)
        self.assertEqual(len(self.files()), 1)


class UploadBodyLimitTests(unittest.TestCase):
    def run_body(self, chunks, headers=()):
        messages, consumed = [], []
        async def app(scope, receive, send):
            while True:
                item = await receive()
                consumed.append(item["body"])
                if not item.get("more_body"): break
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})
        pending = iter(chunks)
        async def receive(): return next(pending)
        async def send(message): messages.append(message)
        scope = {"type": "http", "method": "POST", "path": "/api/patients/test/exams", "headers": headers}
        asyncio.run(ExamUploadLimitMiddleware(app, max_bytes=1024)(scope, receive, send))
        return messages, consumed

    def test_chunked_body_is_rejected_before_multipart_parser(self):
        messages, consumed = self.run_body([
            {"type": "http.request", "body": b"x" * 40000, "more_body": True},
            {"type": "http.request", "body": b"x" * 40000, "more_body": False}])
        self.assertEqual(messages[0]["status"], 413)
        self.assertEqual(consumed, [])

    def test_large_content_length_rejected_without_reading(self):
        messages, consumed = self.run_body([], [(b"content-length", b"100000")])
        self.assertEqual(messages[0]["status"], 413)

    def test_temporary_disk_failure_returns_507_before_parser(self):
        with patch("src.api.upload_limit.tempfile.SpooledTemporaryFile") as factory:
            factory.return_value.write.side_effect = OSError("disk full")
            messages, consumed = self.run_body([{"type": "http.request", "body": b"data", "more_body": False}])
        self.assertEqual(messages[0]["status"], 507)
        self.assertEqual(consumed, [])

    def test_bounded_body_replayed_and_disconnect_does_not_call_endpoint(self):
        messages, consumed = self.run_body([{"type": "http.request", "body": b"data", "more_body": False}])
        self.assertEqual(messages[0]["status"], 200)
        self.assertEqual(b"".join(consumed), b"data")
        self.assertEqual(self.run_body([{"type": "http.disconnect"}]), ([], []))
