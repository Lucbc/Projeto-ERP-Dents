"""Version preconditions and payment preservation over a disposable HTTP API."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200):
        code,body=request(method,path,data,token=token)
        assert code==status,f'{method}: expected {status}, got {code}'
        return body
    entry=expect('POST','/api/financial',{'entry_type':'income','description':'Fictitious version charge',
        'amount_cents':12000,'due_date':'2030-01-07'},201)
    path='/api/financial/'+entry['id']
    assert entry['version']==1
    for data in ({},{'version':None},{'version':0},{'version':True},{'version':'1'}):
        expect('PUT',path,data,422)
        expect('POST',path+'/mark-paid',data,422)
    for suffix in ('','?version=0','?version=invalid'): expect('DELETE',path+suffix,status=422)
    assert expect('GET',path)['version']==1
    passed('financial edit/payment/delete require valid version without changing data')
    dentist=expect('POST','/api/dentists',{'full_name':'Fictitious financial reader','availability':[]},201)
    expect('POST','/api/users',{'name':'Fictitious financial reader','email':'financial-reader@example.com',
        'password':password,'role':'dentist','dentist_id':dentist['id']},201)
    code,login=request('POST','/api/auth/login',{'email':'financial-reader@example.com','password':password})
    assert code==200
    for method,target,data in (('PUT',path,{'version':1,'notes':'Forbidden'}),
                               ('POST',path+'/mark-paid',{'version':1}),('DELETE',path+'?version=1',None)):
        assert request(method,target,data,token=login['session'])[0]==403
        # Anonymous writes have no cookie-bound CSRF proof and stop at the middleware.
        assert request(method,target,data)[0]==403
    assert expect('GET',path)['version']==1
    passed('anonymous and read-only role cannot edit, settle or delete with a valid version')
    gate=Barrier(2,timeout=10)
    def worker(index):
        gate.wait()
        return request('PUT',path,{'version':1,'amount_cents':23456+index,'notes':str(index)},token=token)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
    assert sorted(code for code,_ in results)==[200,409]
    conflict=next(body for code,body in results if code==409)
    assert conflict['code']=='stale_version' and conflict['request_id']
    current=expect('GET',path)
    assert current['version']==2 and current['amount_cents']==23456+int(current['notes'])
    expect('DELETE',path+'?version=1',status=409)
    expect('POST',path+'/mark-paid',{'version':1},409)
    passed('concurrent edits keep coherent winner; stale payment/deletion cannot overwrite it')
    paid=expect('POST',path+'/mark-paid',{'version':2,'payment_method':'pix','paid_at':'2030-01-07T12:34:56.123456Z'})
    assert paid['version']==3
    for version,code in ((2,'stale_version'),(3,'financial_state_conflict')):
        error=expect('POST',path+'/mark-paid',{'version':version,'payment_method':'cash'},409)
        assert error['code']==code
    after=expect('GET',path)
    assert all(after[key]==paid[key] for key in ('version','paid_at','updated_at','total_cents','payment_method'))
    expect('PUT',path,{'version':2,'status':'pending'},409)
    expect('PUT',path,{'version':3,'discount_cents':999999},400)
    assert expect('GET',path)['version']==3
    reviewed=expect('PUT',path,{'version':3,'notes':'Reviewed'})
    assert reviewed['version']==4 and reviewed['paid_at']==paid['paid_at']
    expect('DELETE',path+'?version=3',status=409)
    assert next(row for row in expect('GET','/api/financial')['items'] if row['id']==entry['id'])['version']==4
    expect('DELETE',path+'?version=4',status=204)
    expect('PUT',path,{'version':4,'notes':'Deleted'},404)
    expect('POST',path+'/mark-paid',{'version':4},404)
    expect('DELETE',path+'?version=4',status=404)
    passed('repeated settlement preserves exact date/method; partial review, rollback, list and deleted target verified')


if __name__=='__main__': main(verify,'last-financial-version-smoke.json')
