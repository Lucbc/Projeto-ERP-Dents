"""Real database conflicts and sanitized validation in a disposable HTTP schema."""
import json
from uuid import uuid4
from smoke_bootstrap_homolog import main, docker


def checks(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, payload=None, status=200):
        code, body = request(method, path, payload, token=token,
                             extra_headers={'Origin': 'http://localhost:18081'})
        assert code == status, f'{method} expected {status}, got {code}'
        return body
    name = 'Fictitious-private-marker-' + uuid4().hex
    specialty = expect('POST', '/api/specialties', {'name': name}, 201)
    duplicate = expect('POST', '/api/specialties', {'name': name}, 409)
    assert name not in json.dumps(duplicate)
    assert request.last_headers['Cache-Control'] == 'no-store'
    assert request.last_headers['Access-Control-Allow-Origin'] == 'http://localhost:18081'
    assert request.last_headers['X-Request-ID'] == duplicate['request_id']
    expect('POST', '/api/specialties', {'name': name+'-next'}, 201)
    assert expect('GET', '/api/specialties')['total'] == 2
    assert name not in docker('logs', container).stderr
    database_logs = docker('logs', 'erp-dents-homolog-db-1')
    assert name not in database_logs.stdout + database_logs.stderr
    passed('real unique violation returns private 409 with CORS/reference; subsequent write succeeds')
    private = 'fictitious-private-password-marker'
    bad = expect('POST', '/api/auth/login', {'email': 'invalid', 'password': {'secret': private}}, 422)
    assert private not in json.dumps(bad)
    assert all('input' not in issue and 'ctx' not in issue for issue in bad['detail'])
    passed('real request validation reports fields without echoing private input')
    # Seed only this disposable schema to test a real FK, without agenda business rules.
    patient = expect('POST', '/api/patients', {'full_name': 'Fictitious patient'}, 201)['id']
    dentist = expect('POST', '/api/dentists', {'full_name': 'Fictitious dentist', 'specialty': name, 'availability': []}, 201)['id']
    procedure = expect('POST', '/api/procedures', {'name': 'Fictitious procedure', 'price_cents': 100, 'duration_minutes': 30}, 201)['id']
    appointment = str(uuid4())
    sql(f'''INSERT INTO "{schema}".appointments (id,patient_id,dentist_id,start_at,end_at,status,created_at,updated_at)
        VALUES ('{appointment}','{patient}','{dentist}',now(),now()+interval '30 minutes','scheduled',now(),now());
        INSERT INTO "{schema}".appointment_procedures (appointment_id,procedure_id,created_at) VALUES ('{appointment}','{procedure}',now());''')
    expect('DELETE', '/api/procedures/'+procedure, status=409)
    assert expect('GET', '/api/procedures/'+procedure)['id'] == procedure
    passed('real referenced procedure deletion returns 409 and preserves the record')


if __name__ == '__main__': main(checks, report_name='last-errors-smoke.json')
