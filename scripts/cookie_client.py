"""HTTP test adapter: credentials stay in memory, never in reports or repr."""
import json
from dataclasses import dataclass, field
from http.cookies import SimpleCookie
from urllib.error import HTTPError
from urllib.request import Request, urlopen


@dataclass(repr=False)
class BrowserSession:
    cookies: str = field(repr=False)
    session_id: str = field(repr=False)
    csrf_token: str = field(repr=False)


class CookieClient:
    def __init__(self, base, origin='https://localhost:18443', context=None):
        self.base, self.origin, self.context = base, origin, context

    def raw(self, method, path, payload=None, headers=None, timeout=20):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode() if payload is not None else None
        request = Request(self.base + path, method=method, data=body, headers=headers or {})
        try: response = urlopen(request, timeout=timeout, context=self.context)
        except HTTPError as error: response = error
        with response:
            raw = response.read()
            data = json.loads(raw) if raw and response.headers.get_content_type() == 'application/json' else raw
            return response.status, data, response.headers

    def request(self, method, path, payload=None, session=None, headers=None, timeout=20):
        supplied = {'Content-Type': 'application/json', 'Origin': self.origin}
        if session:
            supplied.update({'Cookie': session.cookies, 'X-Session-ID': session.session_id,
                             'X-CSRF-Token': session.csrf_token})
        if method not in ('GET', 'HEAD', 'OPTIONS') and path in ('/api/auth/login', '/api/auth/bootstrap-admin'):
            code, challenge, response_headers = self.raw('GET', '/api/auth/challenge')
            if code != 200: raise RuntimeError('CSRF challenge unavailable')
            jar = SimpleCookie()
            for value in response_headers.get_all('Set-Cookie', []): jar.load(value)
            supplied.update({'Cookie': '; '.join(f'{k}={v.value}' for k,v in jar.items()),
                             'X-CSRF-Token': challenge['csrf_token']})
        supplied.update(headers or {})
        code, data, response_headers = self.raw(method, path, payload, supplied, timeout)
        if path == '/api/auth/login' and code == 200:
            assert 'access_token' not in data, 'Credential exposed in login JSON'
            jar = SimpleCookie()
            for value in response_headers.get_all('Set-Cookie', []): jar.load(value)
            assert jar and all(v['secure'] and v['httponly'] for v in jar.values())
            data['session'] = BrowserSession('; '.join(f'{k}={v.value}' for k,v in jar.items()),
                                             data['session_id'], data['csrf_token'])
        return code, data, response_headers
