"""Real HTTP generation under three PostgreSQL session zones, private schemas only."""
from functools import partial
from uuid import uuid4
from smoke_bootstrap_homolog import main, docker


def verify(request, email, password, token, container, ready, passed, sql, schema, *, zone):
    actual = docker('exec', container, 'python', '-c',
        "from src.adapters.db.database import engine; from sqlalchemy import text; "
        "c=engine.connect(); print(c.scalar(text('SHOW TimeZone'))); c.close()").stdout.strip()
    assert actual == zone, 'Private API database session timezone mismatch'

    def expect(method, path, data=None, status=200):
        code, body = request(method, path, data, token=token)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body

    patient = expect('POST', '/api/patients', {'full_name': 'Fictitious Clinic Date Patient'}, 201)
    procedure = expect('POST', '/api/procedures', {'name': 'Fictitious Clinic Date Procedure', 'price_cents': 12000}, 201)
    stamps = [('2030-01-08T01:30:00Z', '2030-01-08T02:00:00Z'),
              ('2030-01-07T22:30:00-03:00', '2030-01-07T23:00:00-03:00'),
              ('2030-01-08T10:30:00+09:00', '2030-01-08T11:00:00+09:00')]
    receipts = []
    for (start, end), due in zip(stamps, ({}, {'due_date': None}, {'due_date': '2030-02-10'})):
        dentist = expect('POST', '/api/dentists', {'full_name': 'Fictitious Clinic Date Dentist',
            'availability': [{'day_of_week': 'monday', 'start_time': '20:00', 'end_time': '23:59'}]}, 201)
        visit = expect('POST', '/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
            'procedure_ids': [procedure['id']], 'start_at': start, 'end_at': end}, 201)
        path = '/api/financial/from-appointment/' + visit['id']
        payload = {**due, 'idempotency_key': str(uuid4())}
        entry = expect('POST', path, payload, 201)
        expected = due.get('due_date') or '2030-01-07'
        assert entry['due_date'] == expected
        assert entry['description'].endswith('07/01/2030 22:30')
        saved = expect('GET', '/api/financial/' + entry['id'])
        assert (saved['due_date'], saved['description']) == (expected, entry['description'])
        assert sql(f"SELECT due_date::text FROM \"{schema}\".financial_entries WHERE id='{entry['id']}'") == expected
        retry = expect('POST', path, payload, 201)
        assert (retry['id'], retry['version'], retry['description'], retry['due_date']) == (
            entry['id'], entry['version'], entry['description'], entry['due_date'])
        expect('POST', path, {**payload, 'notes': 'Fictitious changed request'}, 409)
        receipts.append((path, payload, entry))
    path, payload, old = receipts[0]
    # Simulate a pre-fix historical value in this private fixture only.
    sql(f"UPDATE \"{schema}\".financial_entries SET due_date='2030-01-08', description='Fictitious historical UTC text' WHERE id='{old['id']}'")
    replay = expect('POST', path, payload, 201)
    assert replay['due_date'] == '2030-01-08' and replay['description'] == 'Fictitious historical UTC text'
    assert replay['version'] == old['version']
    assert sql(f'SELECT count(*) FROM "{schema}".financial_entries') == '3'
    passed('clinic date/description, explicit due date, persisted values and unchanged historical replay under ' + zone)


if __name__ == '__main__':
    for zone in ('UTC', 'America/Sao_Paulo', 'Asia/Tokyo'):
        main(partial(verify, zone=zone), 'last-financial-clinic-date-' + zone.replace('/', '-') + '.json',
             extra_env={'PGTZ': zone}, versioned_user_fixtures=False)
