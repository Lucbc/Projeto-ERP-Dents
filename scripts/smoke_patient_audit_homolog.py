"""Patient edit authorship/atomicity over HTTP in private homologation."""
import json
from uuid import uuid4
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, payload=None, status=200, session=token):
        code, body = request(method, path, payload, token=session)
        assert code == status, f'Patient audit HTTP expected {status}, got {code}'
        return body

    def events():
        return json.loads(sql(f"""SELECT coalesce(json_agg(a ORDER BY occurred_at,id),'[]'::json)::text
            FROM "{schema}".patient_audit a"""))

    actor = expect('GET', '/api/auth/me')
    patient = expect('POST', '/api/patients', {'full_name':'Fictitious Audit Patient'}, 201)
    path = '/api/patients/' + patient['id']
    baseline = events()
    expect('PUT', path, {'version':1, 'notes':'Fictitious denied'}, 403, None)
    expect('PUT', path, {'version':1, 'cpf':'123'}, 400)
    assert events() == baseline
    saved = expect('PUT', path, {'version':1, 'notes':'Fictitious private content', 'actor_id':str(uuid4())})
    recorded = events()
    assert len(recorded) == len(baseline) + 1
    event = recorded[-1]
    assert event['actor_id'] == actor['id'] and event['patient_id'] == patient['id']
    assert event['changed_fields'] == ['notes'] and event['after_version'] == saved['version']
    expect('PUT', path, {'version':1, 'notes':'Fictitious stale'}, 409)
    assert events() == recorded
    sql(f"""CREATE FUNCTION "{schema}".reject_patient_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Fictitious audit failure' USING ERRCODE='23514'; END $$;
        CREATE TRIGGER reject_patient_audit BEFORE INSERT ON "{schema}".patient_audit
        FOR EACH ROW EXECUTE FUNCTION "{schema}".reject_patient_audit()""")
    try:
        expect('PUT', path, {'version':2, 'active':False}, 422)
        assert expect('GET', path) == saved and events() == recorded
    finally:
        sql(f"""DROP TRIGGER reject_patient_audit ON "{schema}".patient_audit;
            DROP FUNCTION "{schema}".reject_patient_audit()""")
    target = expect('POST', '/api/users', {'name':'Fictitious Reader','email':'audit-reader@example.com',
        'role':'reception','password':password}, 201)
    session = expect('POST','/api/auth/login',{'email':target['email'],'password':password}, session=None)['session']
    matrix = next(row for row in expect('GET','/api/permissions')['items'] if row['role']=='reception')
    matrix['permissions']['patients']['update'] = False
    expect('PUT','/api/permissions/reception',matrix)
    expect('PUT',path,{'version':2,'notes':'Fictitious forbidden'},403,session)
    assert events() == recorded
    assert 'Fictitious' not in json.dumps(recorded) and password not in json.dumps(recorded)
    passed('Patient HTTP authorship, no personal values, anonymous/permission denial, 400/409/422 and atomic rollback approved')


if __name__ == '__main__':
    main(session_checks=verify, report_name='patient-audit-http')
