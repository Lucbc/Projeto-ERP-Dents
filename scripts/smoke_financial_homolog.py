"""Fictitious concurrent generation and retries in a disposable API/schema."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200):
        code, body = request(method, path, data, token=token)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body
    patient = expect('POST','/api/patients',{'full_name':'Fictitious Financial Patient'},201)
    dentist = expect('POST','/api/dentists',{'full_name':'Fictitious Financial Dentist','availability':[
        {'day_of_week':'monday','start_time':'08:00','end_time':'18:00'}]},201)
    procedure = expect('POST','/api/procedures',{'name':'Fictitious Financial Procedure','price_cents':12000},201)
    appointment = expect('POST','/api/appointments',{'patient_id':patient['id'],'dentist_id':dentist['id'],
        'start_at':'2030-01-07T13:00:00Z','end_at':'2030-01-07T14:00:00Z','procedure_ids':[procedure['id']]},201)
    path = '/api/financial/from-appointment/'+appointment['id']
    payload = {'idempotency_key':str(uuid4()),'notes':'Fictitious retry'}
    gate = Barrier(2, timeout=10)
    def generate(_):
        gate.wait()
        return request('POST',path,payload,token=token)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(generate,range(2)))
    assert [code for code,_ in results] == [201,201]
    assert results[0][1]['id'] == results[1][1]['id']
    entry = results[0][1]
    passed('same-key concurrent generation returns one persisted charge and the same ID')
    # New login simulates a different computer or reconnect; result is persisted server-side.
    code, login = request('POST','/api/auth/login',{'email':email,'password':password})
    assert code == 200
    code, retry = request('POST',path,payload,token=login['session'])
    assert code == 201 and retry['id'] == entry['id']
    expect('POST',path,{**payload,'notes':'Changed'},409)
    expect('POST',path,{'idempotency_key':str(uuid4())},409)
    expect('POST',path,{},409)
    passed('retry across sessions recovers original; changed request and other operations conflict')
    expect('POST','/api/financial/'+entry['id']+'/mark-paid',{'version':entry['version'],'idempotency_key':str(uuid4())})
    retry = expect('POST',path,payload,201)
    assert retry['status'] == 'paid' and retry['id'] == entry['id']
    reverse = expect('POST','/api/financial/'+entry['id']+'/reverse-payment',{'version':retry['version'],'payment_id':retry['active_payment_id'],'idempotency_key':str(uuid4()),'reason':'Fictitious correction'})
    expect('PUT','/api/financial/'+entry['id'],{'version':reverse['entry']['version'],'status':'cancelled'})
    replacement = expect('POST',path,{'idempotency_key':str(uuid4())},201)
    retry = expect('POST',path,payload,201)
    assert retry['status'] == 'cancelled' and retry['id'] == entry['id']
    expect('PUT','/api/financial/'+entry['id'],{'version':retry['version'],'status':'pending'},409)
    passed('retries preserve payment/cancellation; new operation may replace cancellation; reactivation conflicts')
    expect('DELETE','/api/financial/'+entry['id']+'?version='+str(retry['version']),status=409)
    expect('DELETE','/api/financial/'+replacement['id']+'?version='+str(replacement['version']),status=204)
    # A result without payment history remains deletable and its receipt is retained.
    replacement_payload = {'idempotency_key':str(uuid4())}
    removable = expect('POST',path,replacement_payload,201)
    expect('DELETE','/api/financial/'+removable['id']+'?version='+str(removable['version']),status=204)
    expect('POST',path,replacement_payload,409)
    assert sql(f'SELECT count(*) FROM "{schema}".financial_entries') == '1'
    assert sql(f'SELECT count(*) FROM "{schema}".financial_generations') == '3'
    passed('paid history cannot be deleted; deleted unpaid result retains receipt and blocks delayed retry')
    expect('POST','/api/auth/logout',{})
    request('POST','/api/auth/logout',token=login['session'])


if __name__ == '__main__': main(verify, 'last-financial-smoke.json')
