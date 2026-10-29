"""Clinical writing with fictional records in a private homologation schema."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def call(method, path, data=None, status=200):
        code, body = request(method, path, data, token=token)
        assert code == status, f'Clinical writer fixture: expected {status}, got {code}'
        return body
    patient = call('POST', '/api/patients', {'full_name': 'Fictitious Writer Patient', 'allergies': 'Fictitious allergy'}, 201)
    other = call('POST', '/api/patients', {'full_name': 'Fictitious Other Writer Patient'}, 201)
    dentist = call('POST', '/api/dentists', {'full_name': 'Fictitious Writer Dentist', 'availability': [
        {'day_of_week': 'monday', 'start_time': '10:00', 'end_time': '12:00'}]}, 201)
    author_email, reader_email = 'writer-author@example.com', 'writer-reader@example.com'
    author = None
    for role, login in [('dentist', author_email), ('reception', reader_email)]:
        data = {'name': 'Fictitious Writer ' + role, 'email': login, 'password': password, 'role': role}
        if role == 'dentist': data['dentist_id'] = dentist['id']
        account = call('POST', '/api/users', data, 201)
        if role == 'dentist': author = account
        grants = next(item for item in call('GET', '/api/permissions')['items'] if item['role'] == role)
        grants['permissions']['clinical_records'] = dict(view=True, create=role == 'dentist', update=role == 'dentist', delete=False)
        call('PUT', '/api/permissions/' + role, grants)
    visits = [call('POST', '/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
               'start_at': f'2030-01-{day}T13:00:00Z', 'end_at': f'2030-01-{day}T14:00:00Z'}, 201) for day in ('07', '14')]
    browser(request, email, password, token, container, ready, passed, sql, schema,
            browser_script='smoke_clinical_writer_browser_homolog.cjs', browser_input={
                'patientId': patient['id'], 'otherPatientId': other['id'], 'visitId': visits[0]['id'], 'raceVisitId': visits[1]['id'],
                'authorEmail': author_email, 'readerEmail': reader_email,
            })
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_records') == '1'
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_addenda') == '1'
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_operations') == '5'
    assert sql(f'''SELECT version=5 AND text='Fictitious winning text' AND finalized_at IS NOT NULL
                   AND author_id='{author['id']}' AND patient_id='{patient['id']}' AND appointment_id='{visits[0]['id']}'
                   AND context->>'allergies'='Fictitious allergy' FROM "{schema}".clinical_records''') == 't'
    assert sql(f'''SELECT text='Fictitious recovered correction' AND reason='Fictitious correction reason'
                   AND author_id='{author['id']}' FROM "{schema}".clinical_addenda''') == 't'
    passed('SQL: one finalized evolution at version five, original author/text/context, one addendum and five operation receipts; stale appointment created no record')


if __name__ == '__main__':
    main(verify, 'last-clinical-writer-browser.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, verify_user_deletion=False)
