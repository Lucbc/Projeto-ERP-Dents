"""Authenticated administrative writes and audit atomicity in private homologation only."""
import json
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, payload=None, status=200, session=token):
        code, body = request(method, path, payload, token=session)
        assert code == status, f'Administrative audit HTTP: expected {status}, got {code}'
        return body

    def events():
        return json.loads(sql(f'''SELECT coalesce(json_agg(a ORDER BY occurred_at,id),'[]'::json)::text
                                  FROM "{schema}".administrative_audit a'''))

    admin = expect('GET', '/api/auth/me')
    backup = expect('POST', '/api/users', {'name': 'Fictitious Audit Admin', 'email': 'audit-admin@example.com',
                                        'role': 'admin', 'password': password}, 201)
    other = expect('POST', '/api/auth/login', {'email': backup['email'], 'password': password}, session=None)['session']
    target = expect('POST', '/api/users', {'name': 'Fictitious Audit Target', 'email': 'audit-target@example.com',
                                        'role': 'reception', 'password': password}, 201)
    restricted = expect('POST', '/api/auth/login', {'email': target['email'], 'password': password}, session=None)['session']
    path = '/api/users/' + target['id']
    before = events()
    expect('PUT', path, {'name': 'Fictitious Denied', 'version': 1}, 403, restricted)
    assert events() == before, 'Denied operation recorded a success event'
    expect('PUT', path, {'name': 'Fictitious Renamed', 'version': 1}, session=other)
    before = events()
    expect('PUT', path, {'name': 'Fictitious Stale', 'version': 1}, 409)
    assert events() == before, 'Stale operation recorded a success event'

    # Reject audit insertion after the user UPDATE; the entire operation must roll back.
    sql(f'''CREATE FUNCTION "{schema}".reject_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Fictitious audit failure' USING ERRCODE='23514'; END $$;
        CREATE TRIGGER reject_audit_fixture BEFORE INSERT ON "{schema}".administrative_audit
        FOR EACH ROW EXECUTE FUNCTION "{schema}".reject_audit_fixture()''')
    try:
        snapshot = expect('GET', path)
        expect('PUT', path, {'is_active': False, 'version': 2}, 422)
        assert expect('GET', path) == snapshot and events() == before, 'Failed audit did not roll back user update'
        expect('GET', '/api/auth/me', session=restricted)
    finally:
        sql(f'''DROP TRIGGER reject_audit_fixture ON "{schema}".administrative_audit;
                DROP FUNCTION "{schema}".reject_audit_fixture()''')

    expect('POST', path + '/set-password', {'new_password': password, 'version': 2}, session=other)
    expect('GET', '/api/auth/me', status=401, session=restricted)
    expect('DELETE', path + '?version=3', status=204)
    matrix = next(item for item in expect('GET', '/api/permissions')['items'] if item['role'] == 'reception')
    old_grant = matrix['permissions']['patients']['delete']
    matrix['permissions']['patients']['delete'] = not old_grant
    expect('PUT', '/api/permissions/reception', matrix, session=other)
    before = events()
    expect('PUT', '/api/permissions/reception', matrix, 409)
    assert events() == before, 'Stale permission update recorded a success event'
    target_events = [e for e in before if e['target_user_id'] == target['id']]
    assert [e['action'] for e in target_events] == ['user.created', 'user.updated', 'user.password_reset', 'user.deleted']
    assert [e['actor_id'] for e in target_events] == [admin['id'], backup['id'], backup['id'], admin['id']]
    assert [(e['before_version'], e['after_version']) for e in target_events] == [(None,1),(1,2),(2,3),(3,None)]
    permission = before[-1]
    assert permission['action'] == 'permissions.updated' and permission['actor_id'] == backup['id']
    assert permission['permission_changes'] == [dict(resource='patients', action='delete', before=old_grant, after=not old_grant)]
    encoded = json.dumps(before)
    assert all(value not in encoded for value in (password, email, backup['email'], target['email'], 'Fictitious', 'password_hash')), 'Audit contains forbidden values'
    # Read-only API: deleted targets remain queryable, grants are live, filters are bounded.
    from urllib.parse import urlencode
    endpoint = '/api/administrative-audit'
    expect('GET', endpoint, status=401, session=None)
    first = expect('GET', endpoint + '?' + urlencode({'target_user_id': target['id'], 'limit': 2}))
    second = expect('GET', endpoint + '?' + urlencode({'target_user_id': target['id'], 'limit': 2, 'cursor': first['next_cursor']}))
    assert [e['action'] for e in first['items'] + second['items']] == [
        'user.deleted', 'user.password_reset', 'user.updated', 'user.created']
    assert second['next_cursor'] is None
    filtered = expect('GET', endpoint + '?' + urlencode({'author_id': backup['id'], 'action': 'user.updated'}))
    assert len(filtered['items']) == 1 and filtered['items'][0]['target_user_id'] == target['id']
    for query in ('limit=101', 'action=invalid', 'author_id=invalid'):
        expect('GET', endpoint + '?' + query, status=422)
    for query in ('cursor=!', 'since=2026-01-01T00:00:00', 'since=2026-01-02T00:00:00Z&until=2026-01-01T00:00:00Z'):
        expect('GET', endpoint + '?' + query, status=400)
    reader = expect('POST', '/api/users', {'name': 'Fictitious Audit Reader', 'email': 'audit-reader@example.com',
                    'role': 'reception', 'password': password}, 201)
    reader_session = expect('POST', '/api/auth/login', {'email': reader['email'], 'password': password}, session=None)['session']
    expect('GET', endpoint, status=403, session=reader_session)
    for grant in (True, False):
        matrix = next(item for item in expect('GET', '/api/permissions')['items'] if item['role'] == 'reception')
        matrix['permissions']['administrative_audit'] = dict(view=grant, create=True, update=True, delete=True)
        saved = expect('PUT', '/api/permissions/reception', matrix)
        assert saved['permissions']['administrative_audit'] == dict(view=grant, create=False, update=False, delete=False)
        snapshot = events()
        result = expect('GET', endpoint, status=200 if grant else 403, session=reader_session)
        assert events() == snapshot, 'Read request changed audit history'
        if grant:
            encoded = json.dumps(result)
            assert all(value not in encoded for value in (password, reader['email'], 'Fictitious', 'password_hash')), 'Read leaked private values'
    expect('POST', endpoint, {}, 405)
    passed('Audit reads: anonymous/denied/granted/revoked access, deleted-target pagination, actor/action filters, invalid input and read-only metadata verified over HTTP/SQL')
    passed('HTTP/SQL: two administrators attributed correctly; denied/stale operations create no event; failed audit rolls back user and sessions; reset revokes sessions; deletion preserves metadata; exact permission delta and no secret/personal values')


if __name__ == '__main__':
    main(verify, 'last-administrative-audit.json', versioned_user_fixtures=False)
