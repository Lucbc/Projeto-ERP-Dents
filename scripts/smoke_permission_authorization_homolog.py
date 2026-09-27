"""Permission writes with real cookie sessions in a disposable API/schema."""
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method}: expected {status}, got {code}'
        if status in (401, 403):
            assert isinstance(body, dict) and 'permissions' not in body and 'items' not in body
        return body

    def matrix(role):
        return next(item['permissions'] for item in expect('GET', '/api/permissions')['items'] if item['role'] == role)

    def account(name, role):
        user = expect('POST', '/api/users', {'name': 'Fictitious ' + name, 'email': name + '@example.com',
                                            'password': password, 'role': role}, 201)
        session = expect('POST', '/api/auth/login', {'email': user['email'], 'password': password}, session=None)['session']
        return user, session

    permissions = matrix('reception')
    permissions['patients']['create'] = False
    saved = expect('PUT', '/api/permissions/reception', {'permissions': permissions})
    assert saved['permissions'] == permissions == matrix('reception')
    expect('PUT', '/api/permissions/admin', {'permissions': permissions}, 400)
    # Anonymous mutation is rejected by browser CSRF protection before the route.
    expect('PUT', '/api/permissions/reception', {'permissions': permissions}, 403, session=None)
    passed('active administrator session persists permissions; immutable admin and anonymous denial preserved')

    for action in ('logout', 'disable', 'demote', 'password', 'delete'):
        user, session = account('permission-' + action, 'admin')
        expect('PUT', '/api/permissions/reception', {'permissions': permissions}, session=session)
        path = '/api/users/' + user['id']
        if action == 'logout':
            expect('POST', '/api/auth/logout', session=session)
            expect('POST', '/api/auth/logout', session=session)
        elif action == 'disable':
            expect('PUT', path, {'is_active': False})
        elif action == 'demote':
            expect('PUT', path, {'role': 'reception'})
        elif action == 'password':
            expect('POST', path + '/set-password', {'new_password': password + '-reset'})
        else:
            expect('DELETE', path, status=204)
        expect('PUT', '/api/permissions/reception', {'permissions': permissions}, 401, session=session)
        assert matrix('reception') == permissions
    passed('logout, inactivation, demotion, password reset and deletion invalidate permission writes without exposing matrices')

    delegate, session = account('permission-delegate', 'coordinator')
    target, _ = account('permission-target', 'reception')
    delegated = matrix('coordinator')
    delegated['users']['update'] = True
    expect('PUT', '/api/permissions/coordinator', {'permissions': delegated})
    expect('PUT', '/api/users/' + target['id'], {'name': 'Fictitious Allowed Edit'}, session=session)
    expect('PUT', '/api/permissions/reception', {'permissions': permissions}, 403, session=session)
    delegated['users']['update'] = False
    expect('PUT', '/api/permissions/coordinator', {'permissions': delegated})
    expect('PUT', '/api/users/' + target['id'], {'name': 'Fictitious Denied Edit'}, 403, session=session)
    assert expect('GET', '/api/users/' + target['id'])['name'] == 'Fictitious Allowed Edit'
    passed('delegated user edit observes subsequent revocation; permissions remain exclusive to administrators')


if __name__ == '__main__':
    main(verify, 'last-permission-authorization-smoke.json')
