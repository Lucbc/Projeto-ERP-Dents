"""Chosen availability policy, maintenance and permissions in private HTTP/schema."""
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body
    hours = [{'day_of_week': 'monday', 'start_time': '08:00', 'end_time': '18:00'}]
    dentist = expect('POST', '/api/dentists', {'full_name': 'Fictitious availability dentist', 'availability': hours}, 201)
    patient = expect('POST', '/api/patients', {'full_name': 'Fictitious private patient'}, 201)
    path = '/api/dentists/' + dentist['id']
    booking = {'patient_id': patient['id'], 'dentist_id': dentist['id'],
               'start_at': '2030-01-07T13:00:00Z', 'end_at': '2030-01-07T14:00:00Z'}
    appointment = expect('POST', '/api/appointments', booking, 201)
    apath = '/api/appointments/' + appointment['id']
    operator = expect('POST', '/api/users', {'name': 'Fictitious availability operator', 'email': 'availability@example.com',
        'password': password, 'role': 'reception'}, 201)
    limited = expect('POST', '/api/auth/login', {'email': operator['email'], 'password': password}, session=None)['session']
    permissions = expect('GET', '/api/permissions/me', session=limited)['permissions']
    permissions['dentists']['update'] = True
    for resource in ('appointments', 'patients', 'financial'):
        for action in permissions[resource]: permissions[resource][action] = False
    expect('PUT', '/api/permissions/reception', {'permissions': permissions})
    for change in ({'active': False}, {'availability': []}):
        response = expect('PUT', path, {'version': 1, 'phone': 'Rejected', **change}, 409, limited)
        assert response['code'] == 'availability_conflict'
        assert patient['full_name'] not in str(response) and patient['id'] not in str(response)
        current = expect('GET', path)
        assert current['version'] == 1 and current['phone'] is None and current['availability'] == hours
    expect('GET', '/api/appointments', status=403, session=limited)
    permissions['dentists']['update'] = False
    expect('PUT', '/api/permissions/reception', {'permissions': permissions})
    expect('PUT', path, {'version': 1, 'active': False}, 403, limited)
    passed('incompatible change rolls back every field/version; restricted operator sees no patient details; revocation enforced')
    expect('PUT', apath, {'version': 1, 'status': 'cancelled'})
    current = expect('PUT', path, {'version': 1, 'active': False})
    assert current['version'] == 2
    response = expect('PUT', apath, {'version': 2, 'status': 'confirmed'}, 409)
    assert response['code'] == 'availability_conflict'
    assert expect('GET', apath)['version'] == 2
    expect('POST', '/api/appointments', booking, 409)
    expect('PUT', apath, {'version': 2, 'notes': 'Fictitious cancelled maintenance'})
    expect('PUT', path, {'version': 2, 'active': True})
    expect('PUT', apath, {'version': 3, 'status': 'scheduled'})
    expect('PUT', apath, {'version': 4, 'status': 'completed'})
    expect('PUT', path, {'version': 3, 'availability': []})
    expect('PUT', apath, {'version': 5, 'notes': 'Fictitious completed maintenance'})
    assert expect('PUT', apath, {'version': 6, 'status': 'scheduled'}, 409)['code'] == 'availability_conflict'
    passed('explicit cancellation releases dentist change; reactivation reserves again; completed/cancelled maintenance remains available')


if __name__ == '__main__': main(verify, 'last-availability-transactions-smoke.json')
