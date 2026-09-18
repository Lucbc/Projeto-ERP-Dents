import asyncio
import json
import os
import unittest
from unittest.mock import patch

from fastapi import Depends, FastAPI, Response
from src.api.browser_session import BrowserSessionMiddleware, csrf, get_cookie_token, marker, set_session_cookie
from src.adapters.security.jwt_auth_service import JwtAuthService
from src.config import get_settings


def call(app, method='POST', path='/api/write', headers=None):
    messages = []
    async def run():
        async def receive(): return {'type': 'http.request', 'body': b'', 'more_body': False}
        async def send(message): messages.append(message)
        await app({'type': 'http', 'asgi': {'version': '3.0'}, 'method': method, 'scheme': 'https',
                   'path': path, 'raw_path': path.encode(), 'query_string': b'',
                   'headers': [(k.lower().encode(), v.encode()) for k,v in (headers or {}).items()],
                   'server': ('localhost', 18443), 'client': ('test', 1)}, receive, send)
    asyncio.run(run())
    return messages[0]['status'], dict(messages[0]['headers'])


class BrowserSessionTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.add_middleware(BrowserSessionMiddleware)
        self.writes = 0
        @self.app.post('/api/write')
        def write(token=Depends(get_cookie_token)):
            self.writes += 1
            return {'ok': True}
        @self.app.post('/api/auth/login')
        def login(): return {'ok': True}
        @self.app.get('/api/read')
        def read(token=Depends(get_cookie_token)): return {'ok': True}
        self.settings = get_settings()
        self.token = JwtAuthService().create_access_token('fictitious', {'jti': 'fictitious'})
        self.headers = {'Origin': self.settings.public_origin,
                        'Cookie': self.settings.session_cookie_name + '=' + self.token,
                        'X-Session-ID': marker(self.token), 'X-CSRF-Token': csrf(self.token)}

    def test_cookie_and_bound_headers_allow_write_without_bearer(self):
        status, headers = call(self.app, headers=self.headers)
        self.assertEqual(status, 200)
        self.assertEqual(headers[b'cache-control'], b'no-store')
        self.assertEqual(self.writes, 1)

    def test_missing_forged_and_other_session_csrf_reject_before_write(self):
        for value in ('', 'x'*64, csrf('another-cookie'), 'é'*64):
            with self.subTest(value=value[:2]):
                self.assertEqual(call(self.app, headers={**self.headers, 'X-CSRF-Token': value})[0], 403)
        self.assertEqual(self.writes, 0)

    def test_origin_is_exact_and_forwarded_headers_cannot_override_it(self):
        for origin in ('', 'null', 'http://localhost:18443', self.settings.public_origin+'.evil'):
            self.assertEqual(call(self.app, headers={**self.headers, 'Origin': origin,
                'Host': 'localhost:18443', 'X-Forwarded-Proto': 'https'})[0], 403)
        self.assertEqual(self.writes, 0)

    def test_referer_fallback_and_missing_origin(self):
        headers = {k:v for k,v in self.headers.items() if k != 'Origin'}
        self.assertEqual(call(self.app, headers=headers)[0], 403)
        self.assertEqual(call(self.app, headers={**headers, 'Referer': 'https://[malformed'})[0], 403)
        self.assertEqual(call(self.app, headers={**headers, 'Referer': self.settings.public_origin+'/page'})[0], 200)

    def test_stale_tab_cannot_read_or_write_with_new_cookie(self):
        for method, path in [('POST','/api/write'), ('GET','/api/read')]:
            self.assertEqual(call(self.app, method, path, {**self.headers, 'X-Session-ID': marker('old-cookie')})[0], 401)
        self.assertEqual(self.writes, 0)

    def test_bearer_alone_cannot_authenticate(self):
        self.assertEqual(call(self.app, 'GET', '/api/read', {'Authorization': 'Bearer '+self.token})[0], 401)

    def test_old_transport_token_cannot_be_replayed_as_cookie(self):
        token = JwtAuthService().create_access_token('fictitious', {'transport': 'old-bearer'})
        self.assertEqual(call(self.app, 'GET', '/api/read', {'Cookie': self.settings.session_cookie_name+'='+token,
            'X-Session-ID': marker(token)})[0], 401)

    def test_login_requires_pre_auth_cookie_and_csrf(self):
        self.assertEqual(call(self.app, path='/api/auth/login', headers=self.headers)[0], 403)
        nonce = 'a'*64
        headers = {'Origin': self.settings.public_origin,
                   'Cookie': self.settings.session_cookie_name+'_pre='+nonce, 'X-CSRF-Token': csrf(nonce)}
        self.assertEqual(call(self.app, path='/api/auth/login', headers=headers)[0], 200)

    def test_cookie_flags_and_expiration(self):
        response = Response()
        set_session_cookie(response, self.token)
        value = response.headers['set-cookie']
        for flag in ('HttpOnly', 'Secure', 'Path=/', 'SameSite=lax', 'Max-Age='):
            self.assertIn(flag, value)
        self.assertNotIn('Domain=', value)

    def test_insecure_or_ambiguous_public_origins_fail_configuration(self):
        for origin in ('http://clinic', 'https://clinic/path', 'https://user@clinic', 'https://clinic#fragment'):
            with patch.dict(os.environ, {'PUBLIC_ORIGIN': origin}):
                get_settings.cache_clear()
                with self.assertRaises(ValueError): get_settings()
        get_settings.cache_clear()
