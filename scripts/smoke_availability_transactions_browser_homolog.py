"""Chosen policy through two Chrome tabs in a disposable TLS environment."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as verify_browser


def verify(request, email, password, token, container, ready, passed, sql, schema):
    status, dentist = request('POST', '/api/dentists', {'full_name': 'Fictitious policy dentist', 'availability': [
        {'day_of_week': 'monday', 'start_time': '08:00', 'end_time': '18:00'}]}, token=token)
    assert status == 201
    status, patient = request('POST', '/api/patients', {'full_name': 'Fictitious policy patient'}, token=token)
    assert status == 201
    status, _ = request('POST', '/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
        'start_at': '2030-01-07T13:00:00Z', 'end_at': '2030-01-07T14:00:00Z'}, token=token)
    assert status == 201
    verify_browser(request, email, password, token, container, ready, passed, sql, schema,
                   browser_script='smoke_availability_transactions_browser_homolog.cjs')


if __name__ == '__main__':
    main(verify, 'last-availability-transactions-browser.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'})
