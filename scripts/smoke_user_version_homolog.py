"""Captured versions over authenticated HTTP; fixture auto-versioning disabled."""
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method}: expected {status}, got {code}'
        if isinstance(body, dict): assert 'password_hash' not in body
        return body
    def account(name):
        return expect('POST', '/api/users', {'name': 'Fictitious ' + name, 'email': name + '@example.com',
                      'password': password, 'role': 'reception'}, 201)
    target = account('version-target')
    path = '/api/users/' + target['id']
    assert target['version'] == 1
    for data in ({}, {'version': 0}, {'version': True}, {'version': '1'}, {'version': 1.5}):
        expect('PUT', path, data, 422)
    expect('POST', path + '/set-password', {'new_password': password}, 422)
    expect('POST', '/api/auth/change-password', {'current_password': password, 'new_password': password + '-new'}, 422)
    expect('DELETE', path, status=422)
    passed('all public writes require explicit valid versions; creation starts at one')

    edited = expect('PUT', path, {'name': 'Fictitious Current', 'version': 1})
    assert edited['version'] == 2
    for method, url, data in (('PUT', path, {'name': 'Fictitious Old', 'version': 1}),
                              ('POST', path + '/set-password', {'new_password': password, 'version': 1}),
                              ('DELETE', path + '?version=1', None)):
        error = expect(method, url, data, 409)
        assert error['code'] == 'stale_version' and 'email' not in error
        assert expect('GET', path) == edited
    assert expect('PUT', path, {'version': 2})['version'] == 3
    passed('old edit, password and deletion conflict without overwriting; accepted no-op increments')

    session = expect('POST', '/api/auth/login', {'email': target['email'], 'password': password}, session=None)['session']
    expect('POST', '/api/auth/change-password', {'current_password': password, 'new_password': password + '-new', 'version': 2}, 409, session)
    assert expect('GET', '/api/auth/me', session=session)['version'] == 3
    expect('POST', '/api/auth/change-password', {'current_password': password, 'new_password': password + '-new', 'version': 3}, session=session)
    expect('GET', '/api/auth/me', status=401, session=session)
    assert expect('GET', path)['version'] == 4
    expect('POST', path + '/set-password', {'new_password': password, 'version': 3}, 409)
    expect('POST', path + '/set-password', {'new_password': password, 'version': 4})
    assert expect('GET', path)['version'] == 5
    passed('own password consumes version and revokes sessions; administrative reset requires refreshed version')

    session = expect('POST', '/api/auth/login', {'email': target['email'], 'password': password}, session=None)['session']
    expect('POST', '/api/auth/logout', session=session)
    expect('POST', '/api/auth/change-password', {'current_password': password, 'new_password': password + '-new', 'version': 1}, 401, session)
    expect('DELETE', path + '?version=5', status=204)
    expect('DELETE', path + '?version=5', status=404)
    admin = expect('GET', '/api/auth/me')
    expect('DELETE', '/api/users/' + admin['id'] + '?version=' + str(admin['version']), status=409)
    assert expect('GET', '/api/auth/me') == admin
    passed('revoked session is rejected before conflict; reviewed deletion and last administrator are preserved')


if __name__ == '__main__':
    main(verify, 'last-user-version-smoke.json', versioned_user_fixtures=False)
