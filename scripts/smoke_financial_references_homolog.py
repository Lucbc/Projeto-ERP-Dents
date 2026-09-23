"""Historical identities through a real disposable API; fictitious data only."""
from uuid import uuid4
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'{method} expected {status}, got {code}'
        return body
    patient = expect('POST', '/api/patients', {'full_name':'Fictitious historical patient'}, 201)
    dentist = expect('POST', '/api/dentists', {'full_name':'Fictitious historical dentist'}, 201)
    procedure = expect('POST', '/api/procedures', {'name':'Fictitious historical procedure', 'price_cents':12000}, 201)
    payload = {'entry_type':'income', 'description':'Fictitious reference charge', 'amount_cents':12000,
        'due_date':'2030-01-07', 'patient_id':patient['id'], 'dentist_id':dentist['id'], 'procedure_ids':[procedure['id']]}
    expect('POST', '/api/financial', {**payload, 'procedure_ids':[str(uuid4())]}, 404)
    entry = expect('POST', '/api/financial', payload, 201)
    path = '/api/financial/'+entry['id']
    assert entry['reference_snapshot']['patient']['name'] == patient['full_name']
    paid_payload = {'version':1, 'idempotency_key':str(uuid4())}
    paid = expect('POST', path+'/mark-paid', paid_payload)
    for resource, item, field in [('patients',patient,'full_name'), ('dentists',dentist,'full_name'), ('procedures',procedure,'name')]:
        expect('PUT', '/api/'+resource+'/'+item['id'], {'version':item['version'], field:'Renamed fictitious record'})
    current = expect('GET', path)
    assert current['patient_name'] == 'Renamed fictitious record'
    assert current['reference_snapshot'] == entry['reference_snapshot']
    reversed_result = expect('POST', path+'/reverse-payment', {'version':2, 'payment_id':paid['payment']['id'],
        'idempotency_key':str(uuid4()), 'reason':'Fictitious reference correction'})
    second = expect('POST', path+'/mark-paid', {'version':reversed_result['entry']['version'], 'idempotency_key':str(uuid4())})
    assert second['payment']['reference_snapshot']['patient']['name'] == 'Renamed fictitious record'
    for resource, item in [('patients',patient), ('dentists',dentist), ('procedures',procedure)]:
        expect('DELETE', '/api/'+resource+'/'+item['id'], status=204)
    replay = expect('POST', path+'/mark-paid', paid_payload)
    assert replay['payment'] == paid['payment'] and replay['entry']['patient_id'] is None
    history = expect('GET', path+'/payments')
    assert len(history) == 2 and history[0]['reference_snapshot']['patient']['name'] == patient['full_name']
    assert replay['entry']['procedure_ids'] == []
    pending = expect('POST', path+'/reverse-payment', {'version':4, 'payment_id':second['payment']['id'],
        'idempotency_key':str(uuid4()), 'reason':'Fictitious correction after deletion'})
    edited = expect('PUT', path, {'version':pending['entry']['version'], 'notes':'Fictitious review'})
    assert edited['procedure_ids'] == [] and edited['reference_snapshot'] == entry['reference_snapshot']
    found = expect('GET', '/api/financial?search=historical&limit=1')
    assert found['total'] == 1 and len(found['items']) == 1
    passed('HTTP identities survive rename/deletion; replay keeps original snapshot; historical search has no duplicates')
    user = expect('POST', '/api/users', {'name':'Fictitious restricted reader', 'email':'references@example.com',
        'password':password, 'role':'reception'}, 201)
    session = expect('POST', '/api/auth/login', {'email':user['email'], 'password':password}, session=None)['session']
    permissions = expect('GET', '/api/permissions/me', session=session)['permissions']
    permissions['financial']['view'] = False
    expect('PUT', '/api/permissions/reception', {'permissions':permissions})
    expect('GET', path, status=403, session=session)
    expect('GET', path+'/payments', status=403, session=session)
    passed('Historical identities require financial.view on entry and payment history')


if __name__ == '__main__':
    main(verify, 'last-financial-references-smoke.json')
