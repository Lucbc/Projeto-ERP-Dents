import asyncio
import errno
import json
import unittest
import traceback
from types import SimpleNamespace
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from src.api.error_boundary import SafeErrorMiddleware
from src.api.error_handlers import register_exception_handlers
from src.core.domain import ConflictError


class Payload(BaseModel):
    password: str
    count: int


def call(app, path, body=None):
    messages = []
    async def run():
        async def receive():
            return {"type": "http.request", "body": json.dumps(body or {}).encode(), "more_body": False}
        async def send(message): messages.append(message)
        await app({"type": "http", "asgi": {"version": "3.0"}, "method": "POST", "scheme": "http",
                   "path": path, "raw_path": path.encode(), "query_string": b"private=fictitious-secret",
                   "headers": [(b"content-type", b"application/json"), (b"origin", b"http://localhost:18080"),
                               (b"x-request-id", b"spoofed"), (b"authorization", b"Bearer fictitious-secret")],
                   "server": ("test", 80), "client": ("test", 1)}, receive, send)
    asyncio.run(run())
    return messages[0]["status"], dict(messages[0]["headers"]), json.loads(b"".join(m.get("body", b"") for m in messages))


class ErrorHandlingTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        register_exception_handlers(self.app)
        self.app.add_middleware(SafeErrorMiddleware)
        self.app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:18080"])

    def test_failure_after_stream_start_aborts_without_a_second_response_or_private_trace(self):
        sent = []
        async def broken(scope, receive, send):
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"partial", "more_body": True})
            raise RuntimeError('fictitious-private-stream-path')
        async def run():
            async def send(message): sent.append(message)
            await SafeErrorMiddleware(broken)({"type": "http"}, None, send)
        with self.assertLogs('src.api.error_boundary', level='ERROR') as logs:
            try: asyncio.run(run())
            except RuntimeError as error:
                rendered = ''.join(traceback.format_exception(error))
            else: self.fail('Incomplete stream was silently accepted')
        self.assertNotIn('fictitious-private-stream-path', rendered + str(logs.output))
        self.assertEqual(sum(m['type'] == 'http.response.start' for m in sent), 1)
        self.assertEqual(sent[-1]['body'], b'partial')

    def test_unexpected_error_is_private_correlated_not_cached_and_has_cors(self):
        @self.app.post('/failure')
        def failure(): raise RuntimeError('fictitious-secret SELECT private FROM patients')
        with self.assertLogs('src.api.error_boundary', level='ERROR') as logs:
            status, headers, body = call(self.app, '/failure')
        self.assertEqual(status, 500)
        self.assertEqual(headers[b'cache-control'], b'no-store')
        self.assertEqual(headers[b'access-control-allow-origin'], b'http://localhost:18080')
        self.assertEqual(headers[b'x-request-id'].decode(), body['request_id'])
        self.assertRegex(body['request_id'], r'^[a-f0-9]{32}$')
        self.assertIn(body['request_id'], str(logs.output))
        for secret in ('fictitious-secret', 'SELECT', 'spoofed'):
            self.assertNotIn(secret, str(body) + str(logs.output))

    def test_validation_does_not_echo_password_or_context(self):
        @self.app.post('/validate')
        def validate(payload: Payload): return {}
        status, _, body = call(self.app, '/validate', {'password': {'secret': 'fictitious-secret'}, 'count': 'private-text'})
        self.assertEqual(status, 422)
        self.assertEqual(len(body['detail']), 2)
        for issue in body['detail']:
            self.assertNotIn('input', issue)
            self.assertNotIn('ctx', issue)
        self.assertNotIn('fictitious-secret', json.dumps(body))
        self.assertNotIn('private-text', json.dumps(body))

    def test_legacy_exception_export_is_handled_with_canonical_identity(self):
        from src.core.domain.exceptions import ConflictError as canonical
        from src.api import register_exception_handlers as exported
        self.assertIs(ConflictError, canonical)
        self.assertIs(exported, register_exception_handlers)
        @self.app.post('/conflict')
        def conflict(): raise ConflictError('Conflito conhecido.')
        self.assertEqual(call(self.app, '/conflict')[0], 409)

    def test_coded_conflicts_keep_server_reference_and_legacy_body_unchanged(self):
        @self.app.post('/coded-conflict')
        def conflict(): raise ConflictError('Conflito conhecido.', code=self.code)
        for code in ('specialty_name_exists', 'stale_version', None):
            self.code = code
            with self.subTest(code=code):
                status, headers, body = call(self.app, '/coded-conflict')
                self.assertEqual(status, 409)
                self.assertEqual(headers[b'cache-control'], b'no-store')
                self.assertEqual(headers[b'access-control-allow-origin'], b'http://localhost:18080')
                if code:
                    self.assertEqual(body['code'], code)
                    self.assertEqual(body['request_id'], headers[b'x-request-id'].decode())
                    self.assertRegex(body['request_id'], r'^[a-f0-9]{32}$')
                    self.assertNotEqual(body['request_id'], 'spoofed')
                else:
                    self.assertEqual(body, {'detail': 'Conflito conhecido.'})

    def test_infrastructure_failures_are_classified_without_raw_database_details(self):
        cases = [(IntegrityError, '23P01', 409), (IntegrityError, '23505', 409), (IntegrityError, '23503', 409),
                 (IntegrityError, '23514', 422), (OperationalError, '40001', 409),
                 (OperationalError, '40P01', 409), (OperationalError, '08006', 503),
                 (ProgrammingError, '42601', 500)]
        @self.app.post('/infra')
        def infra(): raise self.error
        for cls, state, expected in cases:
            self.error = cls('SELECT fictitious-secret', {'password': 'fictitious-secret'}, SimpleNamespace(sqlstate=state))
            with self.subTest(state=state), self.assertLogs('src.api.error_boundary', level='ERROR'):
                status, headers, body = call(self.app, '/infra')
            self.assertEqual(status, expected)
            self.assertNotIn('fictitious-secret', json.dumps(body))
            if expected == 503: self.assertEqual(headers[b'retry-after'], b'10')
        self.error = OSError(errno.ENOSPC, 'fictitious-secret')
        with self.assertLogs('src.api.error_boundary', level='ERROR'):
            self.assertEqual(call(self.app, '/infra')[0], 507)

    def test_real_unavailable_database_returns_503(self):
        from sqlalchemy import create_engine
        engine = create_engine('postgresql+psycopg://fake:fake@127.0.0.1:1/fake', connect_args={'connect_timeout': 1})
        self.addCleanup(engine.dispose)
        @self.app.post('/offline')
        def offline():
            with engine.connect(): pass
        with self.assertLogs('src.api.error_boundary', level='ERROR'):
            self.assertEqual(call(self.app, '/offline')[0], 503)
