"""Quota, crash recovery, concurrency and local antivirus regressions."""
import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import io
import os
import time
import unittest
from unittest.mock import patch

import test_exams
from test_exams import PNG
from src.adapters.db.exam_maintenance import (exam_storage_lock, ensure_quota,
    maintain_exams, reconcile_exams, restore_quarantined, storage_bytes)
from src.adapters.security.exam_scanner import ClamAVScanner
from src.api.upload_limit import ExamUploadLimitMiddleware
from src.core.domain.exceptions import ServiceUnavailableError, StorageUnavailableError, ValidationError


class MaintenanceTests(test_exams.ExamFixture):

    def test_orphan_quarantine_preserves_bytes_recent_and_referenced_files(self):
        exam = self.upload()
        orphan = self.storage.save_file(self.patient.id, 'orphan.png', PNG)
        old = self.storage.get_file_path(self.patient.id, orphan)
        os.utime(old, (time.time()-90000,) * 2)
        recent = self.storage.save_file(self.patient.id, 'recent.png', PNG)
        report = maintain_exams(self.db, self.storage)
        self.assertEqual(report['quarantined'], 1)
        self.assertEqual(report['recent_unreferenced'], 1)
        self.assertEqual(report['missing_referenced'], 0)
        self.assertEqual(self.storage.get_file_path(exam.patient_id, exam.stored_filename).read_bytes(), PNG)
        self.assertTrue(self.storage.get_file_path(self.patient.id, recent).exists())
        archived = self.storage.base_path / '.quarantine' / str(self.patient.id) / orphan
        self.assertEqual(archived.read_bytes(), PNG)
        self.assertEqual(maintain_exams(self.db, self.storage)['quarantined'], 0)
        with exam_storage_lock(self.engine):
            restore_quarantined(self.storage, self.patient.id, orphan)
        self.assertFalse(archived.exists())
        self.assertEqual(old.read_bytes(), PNG)

    def test_restore_refuses_overwrite_and_traversal(self):
        name = self.storage.save_file(self.patient.id, 'test.png', PNG)
        source = self.storage.base_path / '.quarantine' / str(self.patient.id) / name
        source.parent.mkdir(parents=True)
        source.write_bytes(b'recovered')
        with self.assertRaises(FileExistsError):
            restore_quarantined(self.storage, self.patient.id, name)
        self.assertEqual(self.storage.get_file_path(self.patient.id, name).read_bytes(), PNG)
        self.assertEqual(source.read_bytes(), b'recovered')
        with self.assertRaises(ValueError):
            restore_quarantined(self.storage, self.patient.id, '../../outside')

    def test_missing_file_is_reported_without_deleting_metadata(self):
        exam = self.upload()
        self.storage.delete_file(exam.patient_id, exam.stored_filename)
        self.assertEqual(maintain_exams(self.db, self.storage)['missing_referenced'], 1)
        self.assertIsNotNone(self.exams.get(exam.id))

    def test_quota_counts_quarantine_and_rejects_overflow(self):
        self.upload()
        quarantine = self.storage.base_path / '.quarantine'
        quarantine.mkdir()
        (quarantine / 'kept').write_bytes(b'x' * 50)
        used = len(PNG) + 50
        self.assertEqual(storage_bytes(self.storage.base_path), used)
        ensure_quota(self.storage, 10, used + 10)
        with self.assertRaises(StorageUnavailableError): ensure_quota(self.storage, 11, used + 10)

    def test_database_lock_excludes_other_workers_and_releases_on_failure(self):
        def other_worker():
            with exam_storage_lock(self.engine): return True
        with self.assertRaises(RuntimeError):
            with exam_storage_lock(self.engine):
                with ThreadPoolExecutor(1) as pool:
                    with self.assertRaises(ServiceUnavailableError): pool.submit(other_worker).result()
                raise RuntimeError('simulated crash')
        self.assertTrue(other_worker())

    def test_reconciliation_waits_for_upload_publication(self):
        name = self.storage.save_file(self.patient.id, 'test.png', PNG)
        path = self.storage.get_file_path(self.patient.id, name)
        os.utime(path, (time.time()-90000,) * 2)
        with exam_storage_lock(self.engine):
            with self.assertRaises(ServiceUnavailableError): maintain_exams(self.db, self.storage)
            self.exams.create({'patient_id': self.patient.id, 'original_filename': 'test.png',
                'stored_filename': name, 'mime_type': 'image/png', 'size_bytes': len(PNG), 'notes': None})
        self.assertEqual(maintain_exams(self.db, self.storage)['quarantined'], 0)
        self.assertTrue(path.exists())

    def test_symlinks_are_not_followed_or_quarantined(self):
        directory = self.storage.base_path / str(self.patient.id)
        directory.mkdir(exist_ok=True)
        link = directory / 'linked.png'
        link.symlink_to(self.storage.base_path / 'outside')
        self.assertEqual(maintain_exams(self.db, self.storage)['unsafe_entries'], 1)
        self.assertTrue(link.is_symlink())


class ScannerTests(unittest.TestCase):
    def scan_reply(self, reply, age=0):
        date = (datetime.now(timezone.utc)-timedelta(days=age)).strftime('%a %b %d %H:%M:%S %Y')
        with patch('socket.create_connection') as connect:
            connect.return_value.__enter__.return_value.recv.side_effect = [f'ClamAV test/123/{date}\0'.encode(), reply]
            stream = io.BytesIO(PNG)
            try: ClamAVScanner().scan(stream)
            finally: self.assertEqual(stream.tell(), 0)

    def test_clean_result_and_stream_rewind(self):
        self.scan_reply(b'stream: OK\0')

    def test_detection_rejected(self):
        with self.assertRaises(ValidationError): self.scan_reply(b'stream: test FOUND\0')

    def test_unknown_incomplete_or_stale_result_fails_closed(self):
        for reply in (b'stream: ERROR\0', b'NOT OK\0', b''):
            with self.assertRaises(ServiceUnavailableError): self.scan_reply(reply)
        with self.assertRaises(ServiceUnavailableError): self.scan_reply(b'stream: OK\0', age=8)

    def test_connection_failure_fails_closed(self):
        with patch('socket.create_connection', side_effect=TimeoutError()), self.assertRaises(ServiceUnavailableError):
            ClamAVScanner().scan(io.BytesIO(PNG))

    @unittest.skipUnless(os.getenv('RUN_CLAMAV_TESTS') == '1', 'Local antivirus opt-in')
    def test_real_local_clamav_clean_and_eicar(self):
        scanner = ClamAVScanner()
        scanner.scan(io.BytesIO(PNG))
        # Standard harmless EICAR test string, generated only in memory.
        eicar = base64.b64decode('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=')
        with self.assertRaises(ValidationError): scanner.scan(io.BytesIO(eicar))


class UploadAdmissionTests(unittest.TestCase):
    def test_parallel_limit_and_release_after_disconnect(self):
        async def scenario():
            started, release = asyncio.Event(), asyncio.Event()
            scope = {'type': 'http', 'method': 'POST', 'path': '/api/patients/test/exams', 'headers': []}
            async def app(*args): self.fail('Disconnected request reached application')
            async def slow_receive():
                started.set()
                await release.wait()
                return {'type': 'http.disconnect'}
            messages = []
            async def send(message): messages.append(message)
            middleware = ExamUploadLimitMiddleware(app, 1024, max_concurrent=1)
            first = asyncio.create_task(middleware(scope, slow_receive, send))
            await started.wait()
            await middleware(scope, slow_receive, send)
            self.assertEqual(messages[0]['status'], 503)
            release.set()
            await first
            self.assertEqual(middleware.active, 0)
        asyncio.run(scenario())

    def test_slow_body_timeout_releases_slot(self):
        async def scenario():
            async def app(*args): self.fail('Timed out request reached application')
            async def receive(): await asyncio.Event().wait()
            messages = []
            async def send(message): messages.append(message)
            middleware = ExamUploadLimitMiddleware(app, 1024, body_timeout=.01)
            await middleware({'type': 'http', 'method': 'POST', 'path': '/api/patients/test/exams'}, receive, send)
            self.assertEqual(messages[0]['status'], 408)
            self.assertEqual(middleware.active, 0)
        asyncio.run(scenario())
