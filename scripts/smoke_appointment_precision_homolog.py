"""Minute-resolution edits preserve untouched PostgreSQL timestamps."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200):
        code, body = request(method, path, data, token=token)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body
    fixtures = []
    for zone in ('America/Sao_Paulo', 'UTC', 'Asia/Tokyo'):
        for mode in ('list', 'calendar'):
            name = 'Fictitious Precision ' + zone + ' ' + mode
            patient = expect('POST', '/api/patients', {'full_name': name}, 201)
            dentist = expect('POST', '/api/dentists', {'full_name': name, 'availability': [
                {'day_of_week': day, 'start_time': '00:00', 'end_time': '23:59'}
                for day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')]}, 201)
            entry = expect('POST', '/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
                'start_at': '2020-01-07T13:00:12.123456Z', 'end_at': '2020-01-07T14:00:47.654321Z'}, 201)
            fixtures.append({'zone': zone, 'mode': mode, 'name': name, 'entry': entry})
    def times(id):
        return sql(f'''SELECT concat(extract(epoch from start_at), '|', extract(epoch from end_at))
                       FROM "{schema}".appointments WHERE id='{id}' ''')
    original = {f['entry']['id']: times(f['entry']['id']) for f in fixtures}
    for action in ('notes', 'end'):
        browser(request, email, password, token, container, ready, passed, sql, schema,
                browser_script='smoke_appointment_precision_browser_homolog.cjs',
                browser_input={'fixtures': fixtures, 'action': action})
        for f in fixtures:
            entry = expect('GET', '/api/appointments/' + f['entry']['id'])
            assert entry['version'] == (2 if action == 'notes' else 3)
            assert entry['notes'] == 'Fictitious precision notes'
            if action == 'notes':
                assert times(entry['id']) == original[entry['id']], 'Notes edit changed stored instants'
                assert entry['start_at'] == f['entry']['start_at'] and entry['end_at'] == f['entry']['end_at']
            else:
                assert times(entry['id']).split('|')[0] == original[entry['id']].split('|')[0]
                assert sql(f'''SELECT end_at = timestamptz '2020-01-07T14:15:00Z'
                               FROM "{schema}".appointments WHERE id='{entry['id']}' ''') == 't'
        passed('SQL/API: six ' + action + ' edits preserve untouched instants, captured versions and explicit changes')


if __name__ == '__main__':
    main(verify, 'last-appointment-precision-browser.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
