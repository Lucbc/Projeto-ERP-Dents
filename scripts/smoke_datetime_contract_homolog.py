"""3B.4B acceptance: explicit instants, partial updates and legacy receipt recovery.

Only fictional records in the disposable erp-dents-homolog API/schema.
Never print response bodies, identifiers, credentials or container logs.
"""
from datetime import datetime
import argparse
import hashlib
import json
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
        ('null start', {'start_at': None}, 422),
        ('null end', {'end_at': None}, 422),
        ('naive start merged with aware end', {'start_at': '2030-01-07T10:00:00'}, 422),
        ('null status', {'status': None}, 422),
        ('null patient', {'patient_id': None}, 422),
        ('null dentist', {'dentist_id': None}, 422),
    ]:
        code, _ = call('PUT', endpoint, {'version': 1, **patch})
        assert code == expected, label + ': unexpected diagnostic status'
        assert snapshot() == unchanged, label + ': failed request changed stored row'
        passed('HTTP/SQL acceptance: ' + label + ' returns ' + str(code) + '; row/version unchanged')

    code, _ = call('POST', '/api/appointments', {**base, 'start_at': '2030-01-07T10:00:00'})
    assert code == 422
    passed('HTTP acceptance: mixed naive/aware creation returns 422')
    for payload in ({k: v for k, v in base.items() if k != 'start_at'}, {**base, 'start_at': None}):
        assert call('POST', '/api/appointments', payload)[0] == 422
    passed('HTTP acceptance: missing/null start on creation already returns 422')

    code, edited = call('PUT', endpoint, {'version': 1, 'notes': 'Fictitious omitted times'})
    assert code == 200 and edited['version'] == 2
    assert edited['start_at'] == original['start_at'] and edited['end_at'] == original['end_at']
    code, edited = call('PUT', endpoint, {'version': 2, 'notes': None})
    assert code == 200 and edited['notes'] is None and edited['version'] == 3
    assert sql(f'''SELECT start_at=timestamptz '2030-01-07T13:00:00.123456Z'
                   AND end_at=timestamptz '2030-01-07T14:00:00.654321Z'
                   FROM "{schema}".appointments WHERE id='{original['id']}' ''') == 't'
    passed('HTTP/SQL: omitted times preserve microseconds; explicit null clears notes; versions advance')

    for version, start, end in (
        (3, '2030-01-07T10:00:00.123456-03:00', '2030-01-07T11:00:00.654321-03:00'),
        (4, '2030-01-07T22:00:00.123456+09:00', '2030-01-07T23:00:00.654321+09:00'),
    ):
        code, edited = call('PUT', endpoint, {'version': version, 'start_at': start, 'end_at': end})
        assert code == 200 and edited['version'] == version + 1
        assert sql(f'''SELECT start_at=timestamptz '2030-01-07T13:00:00.123456Z'
                       AND end_at=timestamptz '2030-01-07T14:00:00.654321Z'
                       FROM "{schema}".appointments WHERE id='{original['id']}' ''') == 't'
    passed('HTTP/SQL: equivalent explicit offsets preserve instants and microseconds on update')

    for offset_start, offset_end in [('2030-01-14T10:00:00', '2030-01-14T11:00:00')]:
        before = sql(f'SELECT count(*) FROM "{schema}".appointments')
        assert call('POST', '/api/appointments', {**base, 'start_at': offset_start, 'end_at': offset_end})[0] == 422
        assert sql(f'SELECT count(*) FROM "{schema}".appointments') == before
    passed('HTTP/SQL: naive creation rejected without writing in connection ' + DB_ZONE)

    def listed(start, end):
        code, body = call('GET', '/api/appointments?' + urlencode({'from': start, 'to': end}))
        assert code == 200
        return {row['id'] for row in body}
    expected = listed('2030-01-07T10:00:00-03:00', '2030-01-07T12:00:00-03:00')
    assert original['id'] in expected
    assert listed('2030-01-07T13:00:00Z', '2030-01-07T15:00:00Z') == expected
    assert listed('2030-01-07T22:00:00+09:00', '2030-01-08T00:00:00+09:00') == expected
    for bounds in ({'from': '2030-01-07T10:00:00'}, {'to': '2030-01-07T12:00:00'}):
        assert call('GET', '/api/appointments?' + urlencode(bounds))[0] == 422
    passed('HTTP: equivalent offsets agree; naive filter rejected in connection ' + DB_ZONE)

    generation = '/api/financial/from-appointment/' + original['id']
    code, _ = call('POST', generation, {'idempotency_key': str(uuid4()), 'status': 'paid', 'paid_at': '2030-01-07T10:00:00'})
    assert code == 400
    assert sql(f'SELECT count(*) FROM "{schema}".financial_entries') == '0'
    pending = {'idempotency_key': str(uuid4()), 'status': 'pending', 'paid_at': '2030-01-07T10:00:00'}
    assert call('POST', generation, pending)[0] == 400
    assert sql(f'SELECT count(*) FROM "{schema}".financial_entries') == '0'
    code, entry = call('POST', generation, {'idempotency_key': str(uuid4()), 'status': 'pending', 'paid_at': None})
    assert code == 201 and entry['paid_at'] is None
    # Reconstruct a pre-validation receipt in the private schema, without calling the defective API.
    historical = {'appointment_id': original['id'], 'due_date': None,
                  'paid_at': datetime(2030, 1, 7, 10), 'status': 'pending', 'payment_method': None, 'notes': None}
    digest = hashlib.sha256(json.dumps(historical, sort_keys=True, default=str).encode()).hexdigest()
    sql(f'''INSERT INTO "{schema}".financial_generations(key, request_hash, entry_id)
            VALUES ('{pending['idempotency_key']}', '{digest}', '{entry['id']}')''')
    before = sql(f'SELECT row_to_json(e)::text FROM "{schema}".financial_entries e')
    code, replay = call('POST', generation, pending)
    assert code == 201 and replay['id'] == entry['id'] and replay['version'] == entry['version']
    assert call('POST', generation, {**pending, 'notes': 'Fictitious changed body'})[0] == 409
    assert call('POST', generation, {**pending, 'idempotency_key': str(uuid4())})[0] == 400
    assert sql(f'SELECT row_to_json(e)::text FROM "{schema}".financial_entries e') == before
    assert sql(f'SELECT count(*) FROM "{schema}".financial_entries') == '1'
    passed('HTTP/SQL: new naive generations rejected; exact historical receipt recovered; changed body/key cannot duplicate')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--db-zone', choices=['UTC', 'America/Sao_Paulo'], default='UTC')
    DB_ZONE = parser.parse_args().db_zone
    main(verify, 'last-datetime-contract-acceptance.json', extra_env={'PGTZ': DB_ZONE}, versioned_user_fixtures=False)
