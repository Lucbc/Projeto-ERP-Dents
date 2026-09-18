"""TLS/CSRF contract using real cookie handling; only fictitious homologation data."""
import hashlib
from http.cookiejar import CookieJar
import json
import ssl
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPCookieProcessor, HTTPSHandler

from smoke_homolog import ROOT, STATE, verify_target


def main():
    verify_target()
    base = 'https://localhost:18443'
    context = ssl.create_default_context(cafile=str(ROOT/'.data/tls/homolog/ca.crt'))
    jar = CookieJar()
    opener = build_opener(HTTPSHandler(context=context), HTTPCookieProcessor(jar))
    def request(method, path, payload=None, headers=None):
        req = Request(base+path, method=method, headers={'Content-Type':'application/json', **(headers or {})},
                      data=json.dumps(payload).encode() if payload is not None else None)
        try: response = opener.open(req, timeout=20)
        except HTTPError as error: response = error
        with response:
            raw = response.read()
            data = json.loads(raw) if raw and response.headers.get_content_type() == 'application/json' else raw
            return response.status, data, response.headers
    assert request('GET','/health')[0] == 200
    assert request('GET','/patients')[0] == 200
    credentials = json.loads((STATE/'admin.json').read_text())
    assert request('POST','/api/auth/login',credentials)[0] == 403
    challenge = request('GET','/api/auth/challenge')[1]
    pre = {'Origin':base, 'X-CSRF-Token':challenge['csrf_token']}
    assert request('POST','/api/auth/login',credentials,{**pre,'Origin':'https://evil.example'})[0] == 403
    status, session, headers = request('POST','/api/auth/login',credentials,pre)
    assert status == 200 and 'access_token' not in session
    assert headers['Cache-Control'] == 'no-store'
    cookies = [c for c in jar if c.name == '__Host-erp_dents_homolog']
    assert len(cookies) == 1 and cookies[0].secure and cookies[0].has_nonstandard_attr('HttpOnly')
    assert cookies[0].path == '/' and not cookies[0].domain_specified
    assert hashlib.sha256(cookies[0].value.encode()).hexdigest() == session['session_id']
    auth = {'Origin':base, 'X-CSRF-Token':session['csrf_token'], 'X-Session-ID':session['session_id']}
    assert request('GET','/api/auth/me',headers=auth)[0] == 200
    assert request('GET','/api/auth/me')[0] == 401
    assert request('POST','/api/auth/logout',headers={**auth,'X-CSRF-Token':'x'*64})[0] == 403
    # A second login changes the shared cookie; an old tab must not mutate as the new login.
    status, newer, _ = request('POST','/api/auth/login',credentials,pre)
    assert status == 200
    assert request('POST','/api/auth/logout',headers=auth)[0] == 403
    assert request('GET','/api/auth/me',headers=auth)[0] == 401
    newauth = {'Origin':base,'X-CSRF-Token':newer['csrf_token'],'X-Session-ID':newer['session_id']}
    assert request('GET','/api/auth/me',headers=newauth)[0] == 200
    status, _, logout_headers = request('POST','/api/auth/logout',headers=newauth)
    assert status == 200 and not logout_headers.get_all('Set-Cookie')
    assert request('GET','/api/auth/me',headers=newauth)[0] == 401
    assert request('GET','/api/auth/session')[1]['user'] is None
    # Explicitly revoke the first independent session too, without recording either credential.
    jar.clear()
    jar.set_cookie(cookies[0])
    assert request('POST','/api/auth/logout',headers=auth)[0] == 200
    print('OK: trusted TLS, SPA route, cookie flags, login CSRF, session binding, stale-tab rejection and revocation.')


if __name__ == '__main__': main()
