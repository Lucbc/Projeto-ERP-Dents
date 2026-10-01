"""Dashboard resources keep independent authorization in a disposable schema."""
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body

    user = expect('POST', '/api/users', {'name': 'Fictitious Dashboard Reader',
        'email': 'dashboard-reader@example.com', 'password': password, 'role': 'reception'}, 201)
    session = expect('POST', '/api/auth/login', {'email': user['email'], 'password': password}, session=None)['session']
    endpoints = {'patients': '/api/patients?limit=1&offset=0',
                 'dentists': '/api/dentists?limit=1&offset=0', 'appointments': '/api/appointments'}
    matrix = next(item for item in expect('GET', '/api/permissions')['items'] if item['role'] == 'reception')

    def save():
        nonlocal matrix
        matrix = expect('PUT', '/api/permissions/reception',
                        {'version': matrix['version'], 'permissions': matrix['permissions']})

    for endpoint in endpoints.values():
        expect('GET', endpoint, session=None, status=401)
        expect('GET', endpoint, session=session)
    passed('anonymous reads denied; authenticated authorized resources readable')
    for resource, endpoint in endpoints.items():
        matrix['permissions'][resource]['view'] = False
        save()
        effective = expect('GET', '/api/permissions/me', session=session)['permissions']
        assert effective['dashboard']['view'] and not effective[resource]['view']
        expect('GET', endpoint, session=session, status=403)
        for sibling, url in endpoints.items():
            if sibling != resource:
                expect('GET', url, session=session)
        matrix['permissions'][resource]['view'] = True
        save()
        passed(f'dashboard grant does not bypass {resource} denial; sibling resources remain allowed')
    matrix['permissions']['dashboard']['view'] = False
    save()
    assert not expect('GET', '/api/permissions/me', session=session)['permissions']['dashboard']['view']
    for endpoint in endpoints.values():
        expect('GET', endpoint, session=session)
    passed('page permission revocation is distinct from data endpoint permissions')
    expect('POST', '/api/auth/logout', session=session)
    expect('GET', '/api/permissions/me', session=session, status=401)
    for endpoint in endpoints.values():
        expect('GET', endpoint, session=session, status=401)
    passed('revoked session cannot read permissions or indicator resources')


if __name__ == '__main__':
    main(verify, 'last-dashboard-access-smoke.json', versioned_user_fixtures=False)
