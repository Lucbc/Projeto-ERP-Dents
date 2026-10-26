"""Clinical timezone acceptance in real browser/API and private SQL."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def create(path, payload):
        code, body = request('POST', path, payload, token=token)
        assert code == 201, 'Could not create fictional timezone fixture'
        return body

    name = 'Fictitious Timezone Acceptance'
    patient = create('/api/patients', {'full_name': name})
    dentist = create('/api/dentists', {'full_name': 'Fictitious Clinical Dentist', 'availability': [
        {'day_of_week': day, 'start_time': '00:00', 'end_time': '23:59'}
        for day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')]})
    appointment = create('/api/appointments', {
        'patient_id': patient['id'], 'dentist_id': dentist['id'],
        'start_at': '2020-01-08T01:30:00Z', 'end_at': '2020-01-08T02:30:00Z'})
    def snapshot():
        return sql(f'''SELECT row_to_json(a)::text FROM "{schema}".appointments a
                       WHERE id='{appointment['id']}' ''')
    original = snapshot()
    edge_patient = create('/api/patients', {'full_name': 'Fictitious Last Microsecond'})
    edge = create('/api/appointments', {'patient_id': edge_patient['id'], 'dentist_id': dentist['id'],
        'start_at': '2020-01-07T15:00:00Z', 'end_at': '2020-01-07T15:01:00Z'})
    # Private historical fixture: isolate the inclusive filter contract from availability rules.
    sql(f'''UPDATE "{schema}".appointments SET start_at=timestamptz '2020-01-08T02:59:59.999998Z',
            end_at=timestamptz '2020-01-08T02:59:59.999999Z' WHERE id='{edge['id']}' ''')
    creations = [create('/api/patients', {'full_name': 'Fictitious Clinical Create ' + str(i)}) for i in range(4)]
    browser(request, email, password, token, container, ready, passed, sql, schema,
            browser_script='smoke_appointment_timezone_homolog.cjs',
            browser_input={'fixtureName': name, 'dentistName': dentist['full_name'], 'appointmentId': appointment['id'],
                           'edgeId': edge['id'], 'creations': creations})
    assert snapshot() == original, 'Read-only diagnosis modified the appointment'
    for i, patient in enumerate(creations):
        start, end, status, version = (14, 15, 'cancelled', 2) if i < 3 else (12, 13, 'scheduled', 1)
        assert sql(f'''SELECT count(*) FROM "{schema}".appointments
          WHERE patient_id='{patient['id']}' AND start_at=timestamptz '2020-01-{8+i:02d}T{start}:00:00Z'
          AND end_at=timestamptz '2020-01-{8+i:02d}T{end}:00:00Z' AND status='{status}' AND version={version} ''') == '1'
    passed('SQL: reference unchanged; four UI creations and three cross-zone reschedules/cancellations preserved instants and versions')


if __name__ == '__main__':
    main(verify, 'last-appointment-timezone-acceptance.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
