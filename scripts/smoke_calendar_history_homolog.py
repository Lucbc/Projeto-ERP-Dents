"""Historical display fixtures in the disposable homologation schema only."""
from datetime import datetime
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def create(path, payload):
        code, body = request('POST', path, payload, token=token)
        assert code == 201, 'Could not prepare fictitious calendar fixture'
        return body

    dentist = create('/api/dentists', {'full_name': 'Fictitious Historical Dentist', 'availability': [
        {'day_of_week': day, 'start_time': '08:00', 'end_time': '18:00'}
        for day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')]})
    cases = [
        dict(key='short-day', start='2018-11-04T12:00:00Z', end='2018-11-04T13:00:00Z',
             localStart='2018-11-04T10:00', localEnd='2018-11-04T11:00'),
        dict(key='long-day', start='2019-02-17T01:30:00Z', end='2019-02-17T02:30:00Z',
             localStart='2019-02-16T23:30', localEnd='2019-02-16T23:30'),
        dict(key='multiday', start='2020-03-07T03:00:00Z', end='2020-03-10T03:00:00Z',
             localStart='2020-03-07T00:00', localEnd='2020-03-10T00:00'),
    ]
    for i, case in enumerate(cases):
        patient = create('/api/patients', {'full_name': 'Fictitious Calendar ' + case['key']})
        visit = create('/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
                       'start_at': f'2020-01-{6+i:02d}T13:00:00Z', 'end_at': f'2020-01-{6+i:02d}T14:00:00Z'})
        # Historical visualization, not an assertion that current availability permits these intervals.
        sql(f'''UPDATE "{schema}".appointments SET start_at=timestamptz '{case['start']}',
                end_at=timestamptz '{case['end']}' WHERE id='{visit['id']}' ''')
        case.update(id=visit['id'], name=patient['full_name'])
        code, body = request('GET', '/api/appointments/' + visit['id'], token=token)
        assert code == 200 and body['id'] == visit['id'], 'Historical HTTP read failed'
        for field, expected in [('start_at', case['start']), ('end_at', case['end'])]:
            assert datetime.fromisoformat(body[field].replace('Z', '+00:00')) == datetime.fromisoformat(expected.replace('Z', '+00:00')), 'Historical HTTP instant changed'

    def snapshot():
        return sql(f'''SELECT json_agg(a ORDER BY id)::text FROM "{schema}".appointments a''')
    before = snapshot()
    browser(request, email, password, token, container, ready, passed, sql, schema,
            browser_script='smoke_calendar_history_homolog.cjs', browser_input={'cases': cases})
    assert snapshot() == before, 'Historical browser checks changed persisted appointments'
    passed('SQL: all historical rows unchanged after browser display/editor/navigation checks')


if __name__ == '__main__':
    main(verify, 'last-calendar-history.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'},
         versioned_user_fixtures=False)
