"""Authenticated permission reads, using only the disposable bootstrap schema."""
import json

from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body

    table = f'"{schema}".role_permissions'
    # Deliberately absent/legacy fixtures, never the principal schema.
    sql(f'DELETE FROM {table}')
    user = expect('POST', '/api/users', {
        'name': 'Fictitious Permission Reader', 'email': 'permission-reader@example.com',
        'password': password, 'role': 'reception',
    }, 201)
    session = expect('POST', '/api/auth/login', {
        'email': user['email'], 'password': password,
    }, session=None)['session']
    defaults = next(item['permissions'] for item in expect('GET', '/api/permissions')['items']
                    if item['role'] == 'reception')
    assert expect('GET', '/api/permissions/me', session=session)['permissions'] == defaults
    expect('GET', '/api/patients', session=session)
    expect('GET', '/api/users', session=session, status=403)
    assert sql(f'SELECT count(*) FROM {table}') == '0'
    passed('absent matrices retain defaults; list/me and allowed/denied gates create no rows')

    raw = {'patients': {'view': True, 'create': False}, 'legacy': {'keep': True}}
    sql(f"INSERT INTO {table} VALUES ('reception', '{json.dumps(raw)}'::json, now(), now())")

    def snapshot():
        return sql(f'SELECT permissions::text, created_at, updated_at FROM {table}')

    before = snapshot()
    listed = next(item['permissions'] for item in expect('GET', '/api/permissions')['items']
                  if item['role'] == 'reception')
    assert listed['patients']['view'] and not listed['patients']['create']
    assert 'legacy' not in listed
    assert expect('GET', '/api/permissions/me', session=session)['permissions'] == listed
    expect('GET', '/api/patients', session=session)
    expect('POST', '/api/patients', {'full_name': 'Fictitious Denied'}, session=session, status=403)
    assert snapshot() == before
    passed('partial JSON and timestamps remain exact while effective defaults authorize access')

    listed['patients']['view'] = False
    saved = expect('PUT', '/api/permissions/reception', {'permissions': listed})['permissions']
    assert json.loads(sql(f'SELECT permissions::text FROM {table}')) == saved
    before = snapshot()
    assert not expect('GET', '/api/permissions/me', session=session)['permissions']['patients']['view']
    expect('GET', '/api/patients', session=session, status=403)
    expect('GET', '/api/permissions')
    assert snapshot() == before
    expect('PUT', '/api/permissions/reception', {'permissions': defaults}, session=session, status=403)
    expect('PUT', '/api/permissions/admin', {'permissions': defaults}, status=400)
    assert snapshot() == before
    passed('explicit revocation persists; next request denies access; admin-only writes and immutable admin preserved')


if __name__ == '__main__':
    main(verify, 'last-permission-reads-smoke.json')
