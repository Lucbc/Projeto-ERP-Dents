"""ASGI protocol and descriptor ownership; no patient data or database needed."""
import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from src.api.exam_response import OpenExamResponse
from src.api.routers import exams_router
from src.core.domain.exceptions import NotFoundError, ServiceUnavailableError, ValidationError, StorageUnavailableError


class ExamDownloadTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory(prefix='erp-response-test-')
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / 'fictitious.png'
        self.content = bytes(range(256)) * 600
        self.path.write_bytes(self.content)
        self.stream = self.path.open('rb')
        self.addCleanup(self.stream.close)
        self.response = OpenExamResponse(self.stream, 'exame fictício.png')

    def run_response(self, headers=(), method='GET', send_hook=None, disconnect=False, spec='2.4'):
        messages = []
        async def run():
            started = asyncio.Event()
            async def send(message):
                if send_hook: send_hook(message)
                messages.append(message)
                if disconnect and message['type'] == 'http.response.body':
                    started.set()
                    await asyncio.Event().wait()
            async def receive():
                if disconnect:
                    if disconnect != 'before': await started.wait()
                    return {'type': 'http.disconnect'}
                await asyncio.Event().wait()
            scope = {'type':'http', 'method':method, 'headers':headers,
                'asgi':{'spec_version':spec}, 'extensions':{'http.response.pathsend':{}}}
            await asyncio.wait_for(self.response(scope, receive, send), 5)
        asyncio.run(run())
        self.assertTrue(self.stream.closed)
        return messages

    def body(self, messages):
        return b''.join(m.get('body', b'') for m in messages)

    def test_unlinked_after_scan_before_response_has_exact_bytes_and_safe_headers(self):
        self.path.unlink()
        result = self.run_response()
        self.assertEqual(self.body(result), self.content)
        headers = dict(result[0]['headers'])
        self.assertEqual(int(headers[b'content-length']), len(self.content))
        self.assertEqual(headers[b'content-type'], b'application/octet-stream')
        self.assertEqual(headers[b'cache-control'], b'no-store')
        self.assertEqual(headers[b'x-content-type-options'], b'nosniff')
        self.assertIn(b'sandbox', headers[b'content-security-policy'])
        self.assertIn(b"filename*=utf-8''", headers[b'content-disposition'])
        self.assertFalse(result[-1]['more_body'])

    def test_unlinked_after_headers_or_mid_body_never_reopens_path(self):
        for point in ('http.response.start', 'http.response.body'):
            with self.subTest(point=point):
                self.path.write_bytes(self.content)
                self.stream = self.path.open('rb')
                self.response = OpenExamResponse(self.stream, 'test.png')
                def remove(message):
                    if message['type'] == point: self.path.unlink(missing_ok=True)
                self.assertEqual(self.body(self.run_response(send_hook=remove)), self.content)

    def test_ranges_if_range_invalid_and_head_keep_protocol_after_unlink(self):
        cases = [([(b'range',b'bytes=10-19')],206,self.content[10:20]),
                 ([(b'range',b'bytes=-7')],206,self.content[-7:]),
                 ([(b'range',b'bytes=0-2'),(b'if-range',b'"old"')],200,self.content),
                 ([(b'range',b'bytes=999999-')],416,None),
                 ([(b'range',b'invalid')],400,None)]
        for headers,status,body in cases:
            with self.subTest(headers=headers):
                self.path.write_bytes(self.content); self.stream=self.path.open('rb')
                self.response=OpenExamResponse(self.stream,'test.png'); self.path.unlink()
                result=self.run_response(headers)
                self.assertEqual(result[0]['status'],status)
                if body is not None: self.assertEqual(self.body(result),body)
        self.path.write_bytes(self.content); self.stream=self.path.open('rb')
        self.response=OpenExamResponse(self.stream,'test.png')
        self.assertEqual(self.body(self.run_response(method='HEAD')),b'')

    def test_multiple_ranges_and_matching_if_range(self):
        etag=self.response.headers['etag'].encode(); self.path.unlink()
        result=self.run_response([(b'range',b'bytes=0-2,10-19'),(b'if-range',etag)])
        body=self.body(result); headers=dict(result[0]['headers'])
        self.assertEqual(result[0]['status'],206)
        self.assertEqual(int(headers[b'content-length']),len(body))
        self.assertIn(b'Content-Range: bytes 0-2/',body)
        self.assertIn(self.content[10:20],body)

    def test_disconnect_closes_descriptor_for_both_asgi_protocols(self):
        for spec in ('2.0','2.4'):
            for timing in (True,'before'):
                self.stream=self.path.open('rb'); self.response=OpenExamResponse(self.stream,'test.png')
                result=self.run_response(disconnect=timing,spec=spec)
                if timing is True: self.assertTrue(result[-1]['more_body'])

    def test_send_failure_and_short_read_never_finish_successfully(self):
        def fail(_): raise OSError('fictitious disconnect')
        with self.assertRaises(BaseExceptionGroup): self.run_response(send_hook=fail)
        self.assertTrue(self.stream.closed)
        self.stream=self.path.open('rb'); self.response=OpenExamResponse(self.stream,'test.png')
        self.path.write_bytes(b'')
        messages=[]
        with self.assertRaises(BaseExceptionGroup): self.run_response(send_hook=messages.append)
        self.assertTrue(self.stream.closed)
        self.assertFalse(any(m.get('more_body') is False for m in messages))

    def test_route_handles_missing_open_storage_scanner_and_construction_failures(self):
        metadata=SimpleNamespace(get_download=lambda _: (SimpleNamespace(original_filename='test.png'),self.path))
        with patch.object(exams_router,'build_use_case',return_value=metadata):
            for exception in (ValidationError('blocked'),ServiceUnavailableError('offline'),RuntimeError('construction'),OSError('stat')):
                opened=[]
                def scan(stream):
                    opened.append(stream)
                    if isinstance(exception,(ValidationError,ServiceUnavailableError)): raise exception
                with patch.object(exams_router.ClamAVScanner,'scan',side_effect=scan), patch.object(exams_router,'OpenExamResponse',side_effect=exception):
                    with self.assertRaises(StorageUnavailableError if isinstance(exception,OSError) else type(exception)):
                        exams_router.download_exam(uuid4(),Mock())
                self.assertTrue(opened[0].closed)
            with patch.object(Path,'open',side_effect=PermissionError()):
                with self.assertRaises(StorageUnavailableError): exams_router.download_exam(uuid4(),Mock())
            self.path.unlink()
            with self.assertRaises(NotFoundError): exams_router.download_exam(uuid4(),Mock())

    def test_route_releases_read_transaction_and_scans_the_transferred_descriptor(self):
        db=Mock(); scanned=[]
        def scan(stream):
            db.rollback.assert_called_once()
            scanned.append(stream); self.path.unlink()
        metadata=SimpleNamespace(get_download=lambda _: (SimpleNamespace(original_filename='test.png'),self.path))
        with patch.object(exams_router,'build_use_case',return_value=metadata), patch.object(exams_router.ClamAVScanner,'scan',side_effect=scan):
            self.response=exams_router.download_exam(uuid4(),db)
        self.stream=scanned[0]
        self.assertEqual(self.body(self.run_response()),self.content)
