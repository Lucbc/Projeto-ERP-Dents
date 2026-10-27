"""Historical 3B.4A diagnosis; expects existing defects, not future acceptance.

Only fictional records in the disposable erp-dents-homolog API/schema.
Never print response bodies, identifiers, credentials or container logs.
"""
from datetime import datetime, timezone
import argparse
from urllib.parse import urlencode
from uuid import uuid4
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def call(method, path, payload=None):
        return request(method, path, payload, token=token)

    def create(path, payload):
        code, body = call('POST', path, payload)
        if code != 201:
            category = body.get('code', 'unspecified') if isinstance(body, dict) else 'unstructured'
            assert False, 'Could not create fictional fixture; HTTP ' + str(code) + '; category ' + str(category)
        return body

    patient = create('/api/patients', {'full_name': 'Fictitious Datetime Contract'})
    dentist = create('/api/dentists', {'full_name': 'Fictitious Datetime Contract', 'availability': [
        {'day_of_week': 'monday', 'start_time': '10:00', 'end_time': '12:00'}]})
    procedure = create('/api/procedures', {'name': 'Fictitious Datetime Contract', 'price_cents': 10000})
    base = {'patient_id': patient['id'], 'dentist_id': dentist['id'], 'procedure_ids': [procedure['id']],
            'start_at': '2030-01-07T13:00:00.123456Z', 'end_at': '2030-01-07T14:00:00.654321Z'}
    original = create('/api/appointments', base)
    endpoint = '/api/appointments/' + original['id']

    def snapshot():
        return sql(f'''SELECT row_to_json(a)::text FROM "{schema}".appointments a
                       WHERE id='{original['id']}' ''')

    unchanged = snapshot()
    for label, patch, expected in [
        ('null start', {'start_at': None}, 500),
        ('null end', {'end_at': None}, 500),
        ('naive start merged with aware end', {'start_at': '2030-01-07T10:00:00'}, 500),
        ('null status', {'status': None}, 500),
    ]:
        code, _ = call('PUT', endpoint, {'version': 1, **patch})
        assert code == expected, label + ': unexpected diagnostic status'
        assert snapshot() == unchanged, label + ': failed request changed stored row'
        passed('HTTP/SQL diagnosis: ' + label + ' returns ' + str(code) + '; row/version unchanged')

    code, _ = call('POST', '/api/appointments', {**base, 'start_at': '2030-01-07T10:00:00'})
    assert code == 500
    passed('HTTP diagnosis: mixed naive/aware creation returns 500')
    for payload in ({k: v for k, v in base.items() if k != 'start_at'}, {**base, 'start_at': None}):
        assert call('POST', '/api/appointments', payload)[0] == 422
    passed('HTTP diagnosis: missing/null start on creation already returns 422')

    code, edited = call('PUT', endpoint, {'version': 1, 'notes': 'Fictitious omitted times'})
    assert code == 200 and edited['version'] == 2
    assert edited['start_at'] == original['start_at'] and edited['end_at'] == original['end_at']
    code, edited = call('PUT', endpoint, {'version': 2, 'notes': None})
    assert code == 200 and edited['notes'] is None and edited['version'] == 3
    assert sql(f'''SELECT start_at=timestamptz '2030-01-07T13:00:00.123456Z'
                   AND end_at=timestamptz '2030-01-07T14:00:00.654321Z'
                   FROM "{schema}".appointments WHERE id='{original['id']}' ''') == 't'
    passed('HTTP/SQL: omitted times preserve microseconds; explicit null clears notes; versions advance')

    # A naive value relies on the connection zone, despite clinical availability checks.
    naive = create('/api/appointments', {**base, 'start_at': '2030-01-14T10:00:00', 'end_at': '2030-01-14T11:00:00'})
    utc_hour = 10 if DB_ZONE == 'UTC' else 13
    clinical_hour = 7 if DB_ZONE == 'UTC' else 10
    assert datetime.fromisoformat(naive['start_at'].replace('Z', '+00:00')).astimezone(timezone.utc).hour == utc_hour
    assert sql(f'''SELECT start_at AT TIME ZONE 'America/Sao_Paulo' = timestamp '2030-01-14T{clinical_hour:02d}:00:00'
                   FROM "{schema}".appointments WHERE id='{naive['id']}' ''') == 't'
    passed('HTTP/SQL: connection ' + DB_ZONE + '; naive 10h passes clinical availability and stores clinical ' + str(clinical_hour) + 'h')

    def listed(start, end):
        code, body = call('GET', '/api/appointments?' + urlencode({'from': start, 'to': end}))
        assert code == 200
        return {row['id'] for row in body}
    expected = listed('2030-01-07T10:00:00-03:00', '2030-01-07T12:00:00-03:00')
    assert original['id'] in expected and naive['id'] not in expected
    assert listed('2030-01-07T13:00:00Z', '2030-01-07T15:00:00Z') == expected
    assert listed('2030-01-07T22:00:00+09:00', '2030-01-08T00:00:00+09:00') == expected
    implicit = listed('2030-01-07T10:00:00', '2030-01-07T12:00:00')
    assert (original['id'] in implicit) == (DB_ZONE == 'America/Sao_Paulo')
    passed('HTTP: explicit equivalent offsets agree; naive filter follows connection ' + DB_ZONE)

    generation = '/api/financial/from-appointment/' + original['id']
    code, _ = call('POST', generation, {'idempotency_key': str(uuid4()), 'status': 'paid', 'paid_at': '2030-01-07T10:00:00'})
    assert code == 400
    assert sql(f'SELECT count(*) FROM "{schema}".financial_entries') == '0'
    pending = {'idempotency_key': str(uuid4()), 'status': 'pending', 'paid_at': '2030-01-07T10:00:00'}
    code, entry = call('POST', generation, pending)
    assert code == 201 and entry['paid_at'] is None
    code, replay = call('POST', generation, pending)
    assert code == 201 and replay['id'] == entry['id'] and replay['version'] == entry['version']
    assert sql(f'SELECT count(*) FROM "{schema}".financial_entries') == '1'
    passed('HTTP/SQL: generation accepts naive schema; paid rejects with 400, pending discards value and creates entry')
    passed('HTTP/SQL: exact naive generation replay recovers the original entry without duplication')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db-zone', choices=['UTC', 'America/Sao_Paulo'], default='UTC')
    DB_ZONE = parser.parse_args().db_zone
    main(verify, 'last-datetime-contract-diagnosis.json', extra_env={'PGTZ': DB_ZONE}, versioned_user_fixtures=False)
