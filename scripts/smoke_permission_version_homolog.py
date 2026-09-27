"""Version conflicts use captured versions directly, never automatic fixture refresh."""
from copy import deepcopy
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body
    def current(role):
        return next(item for item in expect('GET', '/api/permissions')['items'] if item['role'] == role)
    path = '/api/permissions/reception'
    old = current('reception')
    for payload in ({'permissions': old['permissions']}, *({'version': value, 'permissions': old['permissions']}
                    for value in (-1, None, True, '1', 1.5, 2**63-1))):
        expect('PUT', path, payload, 422)
    assert current('reception') == old
    changed = deepcopy(old)
    changed['permissions']['patients']['create'] = False
    saved = expect('PUT', path, changed)
    assert saved['version'] == old['version'] + 1
    conflict = expect('PUT', path, old, 409)
    assert conflict['code'] == 'stale_version' and 'permissions' not in conflict
    assert current('reception') == saved
    saved = expect('PUT', path, saved)
    assert saved['version'] == old['version'] + 2
    assert current('coordinator')['version'] == 1
    passed('missing/invalid versions rejected; stale form cannot restore permission; explicit reviewed save increments only that profile')

    sql(f'''DELETE FROM "{schema}".role_permissions WHERE role='dentist' ''')
    absent = current('dentist')
    assert absent['version'] == 0
    assert sql(f'''SELECT count(*) FROM "{schema}".role_permissions WHERE role='dentist' ''') == '0'
    created = expect('PUT', '/api/permissions/dentist', absent)
    assert created['version'] == 1
    expect('PUT', '/api/permissions/dentist', absent, 409)
    assert current('dentist') == created
    expect('PUT', '/api/permissions/admin', current('admin'), 400)
    passed('missing matrix remains virtual zero until first explicit save; duplicate first save conflicts; administrator remains immutable')

    user = expect('POST', '/api/users', {'name': 'Fictitious Version Admin', 'email': 'version-admin@example.com',
                                       'password': password, 'role': 'admin'}, 201)
    session = expect('POST', '/api/auth/login', {'email': user['email'], 'password': password}, session=None)['session']
    expect('PUT', '/api/users/' + user['id'], {'is_active': False})
    error = expect('PUT', path, old, 401, session=session)
    assert 'permissions' not in error and error.get('code') != 'stale_version'
    assert current('reception') == saved
    passed('revoked session is rejected before stale-version details; matrix and version unchanged')


if __name__ == '__main__':
    main(verify, 'last-permission-version-smoke.json')
