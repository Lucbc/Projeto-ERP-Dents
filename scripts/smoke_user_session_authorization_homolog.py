"""Real cookie sessions, administrative writes and own password in a private API."""
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method}: expected {status}, got {code}'
        if status in (401, 403):
            assert isinstance(body, dict) and not any(key in body for key in ('email', 'password_hash', 'items'))
        return body

    def account(name, role='admin'):
        user = expect('POST', '/api/users', {'name': 'Fictitious ' + name, 'email': name + '@example.com',
                      'password': password, 'role': role}, 201)
        session = expect('POST', '/api/auth/login', {'email': user['email'], 'password': password}, session=None)['session']
        return user, session

    actor, session = account('live-writer')
    target = expect('POST', '/api/users', {'name': 'Fictitious Target', 'email': 'target@example.com',
                    'password': password, 'role': 'reception'}, 201, session)
    path = '/api/users/' + target['id']
    expect('PUT', path, {'name': 'Fictitious Renamed'}, session=session)
    expect('POST', path + '/set-password', {'new_password': password}, session=session)
    expect('DELETE', path, status=204, session=session)
    expect('POST', '/api/auth/change-password', {'current_password': password, 'new_password': password + '-new'}, session=session)
    expect('GET', '/api/auth/me', status=401, session=session)
    passed('live signed session authorizes all five writes; own password revokes the session')

    target, _ = account('preserved-target', 'reception')
    path = '/api/users/' + target['id']
    for action in ('logout', 'disable', 'demote', 'reset', 'delete'):
        actor, session = account('revoked-' + action)
        actor_path = '/api/users/' + actor['id']
        if action == 'logout': expect('POST', '/api/auth/logout', session=session)
        elif action == 'disable': expect('PUT', actor_path, {'is_active': False})
        elif action == 'demote': expect('PUT', actor_path, {'role': 'reception'})
        elif action == 'reset': expect('POST', actor_path + '/set-password', {'new_password': password + '-reset'})
        else: expect('DELETE', actor_path, status=204)
        expect('POST', '/api/users', {'name': 'Fictitious Denied', 'email': action + '-denied@example.com',
               'password': password, 'role': 'reception'}, 401, session)
        expect('PUT', path, {'name': 'Fictitious Denied'}, 401, session)
        expect('POST', path + '/set-password', {'new_password': password}, 401, session)
        expect('DELETE', path, status=401, session=session)
        expect('POST', '/api/auth/change-password', {'current_password': password, 'new_password': password + '-new'}, 401, session)
        assert expect('GET', path) == target
    passed('five revocations deny all five writes and preserve the target without revealing administrative state')

    actor, first = account('two-live-sessions')
    second = expect('POST', '/api/auth/login', {'email': actor['email'], 'password': password}, session=None)['session']
    expect('POST', '/api/auth/logout', session=first)
    expect('PUT', path, {'name': 'Fictitious Independent Session'}, session=second)
    assert expect('GET', path)['name'] == 'Fictitious Independent Session'
    passed('logout revokes only its session; another live session still writes')


if __name__ == '__main__':
    main(verify, 'last-user-session-authorization-smoke.json')
