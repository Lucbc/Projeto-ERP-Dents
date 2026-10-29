"""Read-only clinical UI acceptance in a private homologation schema."""
from datetime import date, timedelta
from uuid import uuid4
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def call(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'Clinical reader fixture: expected {status}, got {code}'
        return body

    patient = call('POST', '/api/patients', {'full_name': 'Fictitious Clinical Reader Patient',
                   'allergies': 'Fictitious historical allergy', 'medical_history': 'Fictitious historical context'}, 201)
    call('POST', '/api/patients', {'full_name': 'Fictitious Empty History Patient'}, 201)
    dentist = call('POST', '/api/dentists', {'full_name': 'Fictitious Reader Author', 'availability': [
        {'day_of_week': 'monday', 'start_time': '10:00', 'end_time': '12:00'}]}, 201)
    author_email = 'clinical-author-ui@example.com'
    reader_email = 'clinical-reader-ui@example.com'
    for role, login in [('dentist', author_email), ('reception', reader_email)]:
        account = {'name': 'Fictitious Clinical UI ' + role, 'email': login, 'password': password, 'role': role}
        if role == 'dentist':
            account['dentist_id'] = dentist['id']
        call('POST', '/api/users', account, 201)
        permissions = next(item for item in call('GET', '/api/permissions')['items'] if item['role'] == role)
        permissions['permissions']['clinical_records'] = dict(view=True, create=role == 'dentist', update=role == 'dentist', delete=False)
        call('PUT', '/api/permissions/' + role, permissions)
    author = call('POST', '/api/auth/login', {'email': author_email, 'password': password}, session=None)['session']
    for index in range(11):
        day = (date(2030, 1, 7) + timedelta(days=index * 7)).isoformat()
        visit = call('POST', '/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
                     'start_at': day + 'T13:00:00Z', 'end_at': day + 'T14:00:00Z'}, 201)
        record = call('POST', '/api/clinical-records/from-appointment/' + visit['id'],
                      {'key': str(uuid4()), 'text': 'Fictitious original evolution' if index == 0 else 'Fictitious draft ' + str(index)}, 201, author)
        if index == 0:
            endpoint = '/api/clinical-records/' + record['id']
            call('POST', endpoint + '/finalize', {'key': str(uuid4()), 'version': 1}, session=author)
            call('POST', endpoint + '/addenda', {'key': str(uuid4()), 'version': 2,
                 'text': 'Fictitious correction', 'reason': 'Fictitious clarification'}, session=author)
    call('PUT', '/api/patients/' + patient['id'], {'version': patient['version'], 'allergies': 'Fictitious current allergy'})

    def snapshot():
        return tuple(sql(f'''SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'))
                            FROM "{schema}".{table} t''') for table in ('clinical_records', 'clinical_addenda', 'clinical_operations'))
    before = snapshot()
    browser(request, email, password, token, container, ready, passed, sql, schema,
            browser_script='smoke_clinical_reader_browser_homolog.cjs', browser_input={
                'patientId': patient['id'], 'readerEmail': reader_email, 'authorEmail': author_email,
            })
    assert snapshot() == before
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_records') == '11'
    passed('SQL: all eleven clinical records, addendum and operation receipts unchanged by browser navigation')


if __name__ == '__main__':
    main(verify, 'last-clinical-reader-browser.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, verify_user_deletion=False)
