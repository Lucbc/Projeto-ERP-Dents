"""Payment/reversal contracts, durable retries and permissions in a disposable API."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4
from smoke_bootstrap_homolog import main, docker


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token):
        code, body = request(method,path,data,token=session)
        assert code == status, f'{method} expected {status}, got {code}'
        return body
    def create(**extra):
        return expect('POST','/api/financial',{'entry_type':'income','description':'Fictitious history charge',
            'amount_cents':12000,'due_date':'2030-01-07',**extra},201)
    admin=expect('GET','/api/auth/me')
    entry=create()
    path='/api/financial/'+entry['id']
    expect('POST',path+'/mark-paid',{'version':1},422)
    expect('POST',path+'/mark-paid',{'version':1,'idempotency_key':str(uuid4()),'paid_at':'2030-01-07T12:00:00'},422)
    expect('PUT',path,{'version':1,'status':'paid'},409)
    payload={'version':1,'idempotency_key':str(uuid4()),'paid_at':'2030-01-07T12:34:56.123456Z',
             'payment_method':'pix','actor_id':str(uuid4()),'actor_name':'Forged identity'}
    gate=Barrier(2,timeout=10)
    def settle(_):
        gate.wait()
        return request('POST',path+'/mark-paid',payload,token=token)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(settle,range(2)))
    assert [code for code,_ in results]==[200,200]
    first=results[0][1]
    assert first['payment']['id']==results[1][1]['payment']['id']
    assert first['payment']['actor_id']==admin['id'] and first['payment']['actor_name']==admin['name']
    expect('POST',path+'/mark-paid',{**payload,'payment_method':'cash'},409)
    expect('PUT',path,{'version':2,'notes':'Rewrite'},409)
    expect('DELETE',path+'?version=2',status=409)
    passed('same-key HTTP race creates one payment with server identity; direct PUT/delete cannot rewrite it')
    user=expect('POST','/api/users',{'name':'Fictitious receptionist','email':'history-reception@example.com',
        'password':password,'role':'reception'},201)
    login=expect('POST','/api/auth/login',{'email':user['email'],'password':password},session=None)
    reception=login['session']
    reverse={'version':2,'payment_id':first['payment']['id'],'idempotency_key':str(uuid4()),'reason':'Fictitious correction'}
    expect('POST',path+'/reverse-payment',reverse,403,session=reception)
    permissions=expect('GET','/api/permissions/me',session=reception)['permissions']
    assert not permissions['financial_reversals']['create']
    permissions['financial_reversals']['create']=True
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    reversed_result=expect('POST',path+'/reverse-payment',reverse,session=reception)
    assert reversed_result['entry']['status']=='pending' and reversed_result['entry']['version']==3
    assert reversed_result['reversal']['actor_id']==user['id']
    permissions['financial_reversals']['create']=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    expect('POST',path+'/reverse-payment',reverse,403,session=reception)
    expect('DELETE',path+'?version=3',status=409)
    passed('reversal requires separate permission, reason and active payment; revocation blocks replay and history survives')
    expect('PUT',path,{'version':3,'amount_cents':23456})
    second=expect('POST',path+'/mark-paid',{'version':4,'idempotency_key':str(uuid4())})
    docker('restart',container); ready()
    new_login=expect('POST','/api/auth/login',{'email':email,'password':password},session=None)
    replay=expect('POST',path+'/mark-paid',payload,session=new_login['session'])
    assert replay['replayed'] and replay['payment']['id']==first['payment']['id']
    assert replay['entry']['active_payment_id']==second['payment']['id'] and replay['reversal']
    replay_reverse=expect('POST',path+'/reverse-payment',reverse,session=new_login['session'])
    assert replay_reverse['replayed'] and replay_reverse['entry']['version']==5
    history=expect('GET',path+'/payments',session=new_login['session'])
    assert len(history)==2 and history[0]['paid_at']==first['payment']['paid_at']
    assert sql(f'SELECT count(*) FROM "{schema}".financial_reversals')=='1'
    passed('restart/new session preserves receipts; delayed payment/reversal retries return original events and current state')
    paid_payload={'entry_type':'expense','description':'Fictitious paid expense','amount_cents':0,
                  'due_date':'2030-01-07','status':'paid','idempotency_key':str(uuid4())}
    a=expect('POST','/api/financial',paid_payload,201,session=new_login['session'])
    b=expect('POST','/api/financial',paid_payload,201,session=new_login['session'])
    assert a['id']==b['id'] and a['has_payments']
    assert len(expect('GET','/api/financial/'+a['id']+'/payments',session=new_login['session']))==1
    passed('paid manual expense creation and zero total have one immutable event across retries')


if __name__=='__main__': main(verify,'last-financial-history-smoke.json')
