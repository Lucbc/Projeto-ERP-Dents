"""Clinical HTTP/SQL acceptance using only a disposable homologation schema."""
from uuid import uuid4
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def call(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method} clinical acceptance: expected {status}, got {code}'
        return body

    def grant(role, view=False, create=False, update=False):
        current = next(item for item in call('GET', '/api/permissions')['items'] if item['role'] == role)
        matrix = {} if role == 'admin' else current['permissions']
        matrix['clinical_records'] = dict(view=view, create=create, update=update, delete=False)
        result = call('PUT', '/api/permissions/' + role, {'version': current['version'], 'permissions': matrix})
        assert result['version'] == current['version'] + 1
        return result

    patient = call('POST', '/api/patients', {'full_name': 'Fictitious Clinical Patient',
                   'allergies': 'Fictitious allergy', 'medical_history': 'Fictitious history'}, 201)
    other = call('POST', '/api/patients', {'full_name': 'Fictitious Other Patient'}, 201)
    dentist = call('POST', '/api/dentists', {'full_name': 'Fictitious Clinical Dentist', 'availability': [
        {'day_of_week': 'monday', 'start_time': '10:00', 'end_time': '12:00'}]}, 201)
    user = call('POST', '/api/users', {'name': 'Fictitious Clinical Author', 'email': 'clinical@example.com',
                'password': password, 'role': 'dentist', 'dentist_id': dentist['id']}, 201)
    session = call('POST', '/api/auth/login', {'email': user['email'], 'password': password}, session=None)['session']
    visits = []
    for day in ('07', '14'):
        visits.append(call('POST', '/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
                      'start_at': f'2030-01-{day}T13:00:00Z', 'end_at': f'2030-01-{day}T14:00:00Z'}, 201))
    listing = '/api/clinical-records?patient_id=' + patient['id']
    create_path = '/api/clinical-records/from-appointment/' + visits[0]['id']
    draft = {'key': str(uuid4()), 'text': 'Fictitious clinical draft'}
    call('GET', listing, status=403)
    call('POST', create_path, draft, 403, session)
    grant('dentist', True, True, True)
    created = call('POST', create_path, draft, 201, session)
    endpoint = '/api/clinical-records/' + created['id']
    assert created['author_id'] == user['id'] and created['version'] == 1 and created['context'] is None
    assert call('POST', create_path, draft, 201, session) == created
    call('POST', create_path, {**draft, 'text': 'Fictitious changed retry'}, 409, session)
    call('POST', create_path, {**draft, 'key': str(uuid4())}, 409, session)
    for field in ('author_id', 'patient_id', 'context', 'finalized_at'):
        call('PUT', endpoint, {'key': str(uuid4()), 'version': 1, 'text': 'Fictitious', field: 'forged'}, 422, session)
    saved = call('PUT', endpoint, {'key': str(uuid4()), 'version': 1, 'text': 'Fictitious saved evolution'}, session=session)
    assert saved['version'] == 2
    call('PUT', endpoint, {'key': str(uuid4()), 'version': 1, 'text': 'Fictitious stale'}, 409, session)
    final_payload = {'key': str(uuid4()), 'version': 2}
    final = call('POST', endpoint + '/finalize', final_payload, session=session)
    assert final['context'] == {'allergies': patient['allergies'], 'medical_history': patient['medical_history']}
    addition = {'key': str(uuid4()), 'version': 3, 'text': 'Fictitious correction', 'reason': 'Fictitious clarification'}
    amended = call('POST', endpoint + '/addenda', addition, session=session)
    assert amended['version'] == 4 and len(amended['addenda']) == 1
    assert amended['text'] == final['text'] and amended['context'] == final['context']
    assert call('POST', endpoint + '/addenda', addition, session=session) == amended
    assert call('POST', endpoint + '/finalize', final_payload, session=session) == final
    assert call('POST', create_path, draft, 201, session) == created
    call('PUT', endpoint, {'key': str(uuid4()), 'version': 4, 'text': 'Fictitious overwrite'}, 409, session)
    call('DELETE', endpoint, status=405, session=session)
    passed('HTTP: strict payload, authored draft/save/finalize/addendum, exact historical replay and immutable final text')

    other_dentist = call('POST', '/api/dentists', {'full_name': 'Fictitious Other Dentist'}, 201)
    for role in ('coordinator', 'reception', 'dentist'):
        account = {'name': 'Fictitious Clinical Reader', 'email': role + '-reader@example.com',
                   'password': password, 'role': role}
        if role == 'dentist':
            account['dentist_id'] = other_dentist['id']
        call('POST', '/api/users', account, 201)
        reader = call('POST', '/api/auth/login', {'email': account['email'], 'password': password}, session=None)['session']
        grant(role, True, True, True)
        assert call('GET', endpoint, session=reader) == amended
        call('POST', endpoint + '/addenda', {**addition, 'key': str(uuid4()), 'version': 4}, 403, reader)
        call('POST', create_path, {'key': str(uuid4()), 'text': ''}, 403, reader)
    passed('HTTP: all configured roles can read; other dentist and non-dentist roles cannot write as the author')

    second = call('POST', '/api/clinical-records/from-appointment/' + visits[1]['id'],
                  {'key': str(uuid4()), 'text': ''}, 201, session)
    call('POST', '/api/clinical-records/' + second['id'] + '/finalize', {'key': str(uuid4()), 'version': 1}, 400, session)
    assert call('GET', listing + '&limit=1', session=session)['items'][0]['id'] == second['id']
    page = call('GET', listing + '&limit=1&offset=1', session=session)
    assert page['total'] == 2 and page['items'][0] == amended
    assert call('GET', '/api/clinical-records?patient_id=' + other['id'], session=session) == {'items': [], 'total': 0}
    for suffix in ('&limit=0', '&limit=101', '&offset=-1'):
        call('GET', listing + suffix, status=422, session=session)
    grant('admin', True)
    assert call('GET', endpoint) == amended
    call('POST', endpoint + '/addenda', {**addition, 'key': str(uuid4()), 'version': 4}, 403)
    grant('admin', False)
    call('GET', endpoint, status=403)
    grant('dentist', False)
    call('GET', listing, status=403, session=session)
    call('POST', create_path, draft, 403, session)
    grant('dentist', True, True, True)
    passed('HTTP: patient-filtered pagination, admin explicit read only, immediate grant revocation including receipts')

    visit_path = '/api/appointments/' + visits[0]['id']
    call('PUT', visit_path, {'version': 1, 'patient_id': other['id']}, 409)
    call('DELETE', visit_path + '?version=1', status=409)
    assert call('GET', visit_path)['patient_id'] == patient['id']
    assert call('GET', endpoint, session=session) == amended
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_records') == '2'
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_addenda') == '1'
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_operations') == '5'
    call('POST', '/api/auth/logout', session=session)
    call('GET', endpoint, status=401, session=session)
    passed('HTTP/SQL: protected appointment links, controlled conflicts, preserved rows and session revocation')


if __name__ == '__main__':
    main(verify, 'last-clinical-records-smoke.json', verify_user_deletion=False)
