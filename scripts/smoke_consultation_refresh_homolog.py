"""Existing consultation scope/read semantics against a disposable homologation API."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body

    availability = [{'day_of_week': day, 'start_time': '00:00', 'end_time': '23:59'}
                    for day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')]
    dentists = [expect('POST', '/api/dentists', {'full_name': f'Fictitious Reader Dentist {i}', 'availability': availability}, 201) for i in range(2)]
    patients = [expect('POST', '/api/patients', {'full_name': f'Fictitious Consultation Patient {i}'}, 201) for i in range(4)]
    users = [expect('POST', '/api/users', {'name': f'Fictitious Dentist User {i}', 'email': f'consultation-{i}@example.com',
        'password': password, 'role': 'dentist', 'dentist_id': dentist['id']}, 201) for i, dentist in enumerate(dentists)]
    sessions = [expect('POST', '/api/auth/login', {'email': user['email'], 'password': password}, session=None)['session'] for user in users]
    start = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)

    def create(dentist, patient, hour):
        begin = start + timedelta(hours=hour)
        return expect('POST', '/api/appointments', {'dentist_id': dentist['id'], 'patient_id': patient['id'], 'procedure_ids': [],
            'start_at': begin.isoformat(), 'end_at': (begin + timedelta(hours=1)).isoformat()}, 201)

    first, second, foreign = create(dentists[0], patients[0], 0), create(dentists[0], patients[1], 2), create(dentists[1], patients[2], 0)
    read = lambda path: expect('GET', '/api/consultations' + path, session=sessions[0])
    assert read('/next')['id'] == first['id']
    assert expect('GET', '/api/consultations/next', session=sessions[1])['id'] == foreign['id']
    assert read('/next?dentist_id=' + dentists[1]['id'])['id'] == first['id']
    listing = read('/patients?dentist_id=' + dentists[1]['id'])
    assert listing['total'] == 4
    assert next(item for item in listing['items'] if item['patient']['id'] == patients[2]['id'])['next_appointment'] is None
    assert read('/patients/' + patients[2]['id'] + '?dentist_id=' + dentists[1]['id'])['upcoming_appointments'] == []
    passed('two dentists have distinct next visits; foreign scope parameters cannot override authenticated link')
    assert read('/patients/' + patients[3]['id'])['next_appointment'] is None
    assert read('/patients?search=Patient%203')['total'] == 1
    expect('GET', '/api/consultations/patients/' + str(uuid4()), session=sessions[0], status=404)
    passed('global patient list, search, no future visit and missing detail remain distinct')

    changed = expect('PUT', '/api/appointments/' + first['id'], {'version': first['version'],
        'start_at': (start + timedelta(hours=4)).isoformat(), 'end_at': (start + timedelta(hours=5)).isoformat()})
    assert read('/next')['id'] == second['id']
    assert read('/patients/' + patients[0]['id'])['next_appointment']['start_at'] == changed['start_at']
    expect('PUT', '/api/appointments/' + second['id'], {'version': second['version'], 'status': 'cancelled'})
    assert read('/next')['id'] == first['id']
    expect('DELETE', '/api/appointments/' + first['id'] + '?version=' + str(changed['version']), status=204)
    assert read('/next') is None
    assert read('/patients/' + patients[0]['id'])['next_appointment'] is None
    passed('reschedule, cancellation and deletion change next/detail without changing patient selection')

    # Past-start fixture only in the private schema; no server/OS clock changes.
    sql(f'''UPDATE "{schema}".appointments SET start_at=now()-interval '1 minute', end_at=now()+interval '1 hour'
            WHERE id='{foreign['id']}' ''')
    assert expect('GET', '/api/consultations/next', session=sessions[1]) is None
    passed('a visit whose start has passed is not treated as a future visit, even before its end')

    matrix = next(item for item in expect('GET', '/api/permissions')['items'] if item['role'] == 'dentist')
    matrix['permissions']['consultations']['view'] = False
    matrix = expect('PUT', '/api/permissions/dentist', {'version': matrix['version'], 'permissions': matrix['permissions']})
    for path in ('/next', '/patients', '/patients/' + patients[0]['id']):
        expect('GET', '/api/consultations' + path, session=sessions[0], status=403)
        expect('GET', '/api/consultations' + path, session=None, status=401)
    passed('resource revocation blocks every consultation read; anonymous reads remain denied')
    matrix['permissions']['consultations']['view'] = True
    expect('PUT', '/api/permissions/dentist', {'version': matrix['version'], 'permissions': matrix['permissions']})
    # Public user writes reject missing dentist links; reproduce a legacy invalid row privately.
    sql(f'''UPDATE "{schema}".users SET dentist_id=NULL WHERE id='{users[0]['id']}' ''')
    for path in ('/next', '/patients', '/patients/' + patients[0]['id']):
        expect('GET', '/api/consultations' + path, session=sessions[0], status=400)
    passed('legacy unlinked dentist cannot fall back to another dentist scope')


if __name__ == '__main__':
    main(verify, 'last-consultation-refresh-smoke.json', versioned_user_fixtures=False)
