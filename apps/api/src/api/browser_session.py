"""Cookie transport and CSRF. Credentials never appear in JSON responses."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, Response
from starlette.responses import JSONResponse

from src.config import get_settings


def marker(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def csrf(value: str) -> str:
    return hmac.new(get_settings().jwt_secret_key.encode(),
                    b'erp-csrf-v1\x00' + value.encode(), hashlib.sha256).hexdigest()


def session_cookie(request: Request) -> str:
    return request.cookies.get(get_settings().session_cookie_name, '')


def get_cookie_token(request: Request) -> str:
    token = session_cookie(request)
    if not token or not hmac.compare_digest(request.headers.get('X-Session-ID', '').encode(), marker(token).encode()):
        raise HTTPException(401, 'Sessão alterada. Entre novamente.')
    from src.adapters.security.jwt_auth_service import JwtAuthService
    payload = JwtAuthService().decode_access_token(token)
    if payload is None or payload.get('transport') != 'cookie-v1':
        raise HTTPException(401, 'Sessão encerrada. Entre novamente.')
    return token


def set_session_cookie(response: Response, token: str):
    settings = get_settings()
    response.set_cookie(settings.session_cookie_name, token, secure=True, httponly=True,
                        samesite='lax', path='/', max_age=settings.jwt_expire_minutes * 60)
    response.headers['Cache-Control'] = 'no-store'


def anonymous_context(request: Request, response: Response) -> dict:
    name = get_settings().session_cookie_name + '_pre'
    value = request.cookies.get(name, '')
    if len(value) != 64 or any(c not in '0123456789abcdef' for c in value):
        value = secrets.token_hex(32)
        response.set_cookie(name, value, secure=True, httponly=True, samesite='strict',
                            path='/', max_age=3600)
    return {'session_id': None, 'expires_at': None, 'csrf_token': csrf(value), 'user': None}


class BrowserSessionMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        request = Request(scope)
        if request.url.path.startswith('/api/') and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('origin')
            if origin is None:
                try:
                    referer = urlsplit(request.headers.get('referer', ''))
                    origin = f'{referer.scheme}://{referer.netloc}'
                except ValueError:
                    origin = ''
            settings = get_settings()
            value = session_cookie(request)
            # Login/bootstrap use the explicit pre-auth challenge even if an old
            # revoked session cookie remains in the browser.
            if request.url.path in ('/api/auth/login', '/api/auth/bootstrap-admin'):
                value = request.cookies.get(settings.session_cookie_name + '_pre', '')
            supplied = request.headers.get('x-csrf-token', '')
            if (origin != settings.public_origin or not value or len(supplied) != 64
                    or not hmac.compare_digest(supplied.encode(), csrf(value).encode())):
                response = JSONResponse({'detail': 'Requisição não autorizada. Atualize a página.'},
                                        status_code=403, headers={'Cache-Control': 'no-store'})
                return await response(scope, receive, send)
        async def safe_send(message):
            if message['type'] == 'http.response.start' and request.url.path.startswith('/api/'):
                headers = [(k, v) for k, v in message.get('headers', []) if k.lower() != b'cache-control']
                message = {**message, 'headers': headers + [(b'cache-control', b'no-store')]}
            await send(message)
        await self.app(scope, receive, safe_send)
