"""Historical diagnosis: expects workstation-dependent agenda times before 3B.3B."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def create(path, payload):
        code, body = request('POST', path, payload, token=token)
        assert code == 201, 'Could not create fictional timezone fixture'
        return body

    name = 'Fictitious Timezone Diagnosis'
    patient = create('/api/patients', {'full_name': name})
    dentist = create('/api/dentists', {'full_name': name, 'availability': [
        {'day_of_week': day, 'start_time': '00:00', 'end_time': '23:59'}
        for day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')]})
    appointment = create('/api/appointments', {
        'patient_id': patient['id'], 'dentist_id': dentist['id'],
        'start_at': '2020-01-08T01:30:00Z', 'end_at': '2020-01-08T02:30:00Z'})
    def snapshot():
        return sql(f'''SELECT row_to_json(a)::text FROM "{schema}".appointments a
                       WHERE id='{appointment['id']}' ''')
    original = snapshot()
    browser(request, email, password, token, container, ready, passed, sql, schema,
            browser_script='diagnose_appointment_timezone_homolog.cjs',
            browser_input={'fixtureName': name, 'appointmentId': appointment['id']})
    assert snapshot() == original, 'Read-only diagnosis modified the appointment'
    passed('SQL: appointment unchanged after list, filters and calendar diagnosis in three zones')


if __name__ == '__main__':
    main(verify, 'last-appointment-timezone-diagnosis.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
