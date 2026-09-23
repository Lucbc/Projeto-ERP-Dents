"""Procedure version and price preservation through an isolated HTTP API."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200):
        code,body=request(method,path,data,token=token)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    procedure=expect('POST','/api/procedures',{'name':'Fictitious Version Procedure','price_cents':12000},201)
    path='/api/procedures/'+procedure['id']
    for data in ({},{'version':None},{'version':0},{'version':True},{'version':'1'}): expect('PUT',path,data,422)
    assert expect('GET',path)['version']==1
    passed('procedure version is required; invalid preconditions leave catalog unchanged')
    gate=Barrier(2,timeout=10)
    def worker(index):
        gate.wait()
        return request('PUT',path,{'version':1,'name':str(index),'price_cents':12345+index,'duration_minutes':30+index},token=token)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
    assert sorted(code for code,_ in results)==[200,409]
    winner=next(body for code,body in results if code==200)
    current=expect('GET',path)
    assert current['version']==2
    assert all(current[key]==winner[key] for key in ('name','price_cents','duration_minutes'))
    expect('PUT',path,{'version':1,'price_cents':None,'duration_minutes':None},409)
    assert expect('GET',path)['price_cents']==winner['price_cents']
    passed('concurrent edits keep matching winner fields; stale draft cannot clear price or duration')
    current=expect('PUT',path,{'version':2,'description':'Reviewed'})
    assert current['version']==3 and current['price_cents']==winner['price_cents']
    zero=expect('PUT',path,{'version':3,'price_cents':0,'duration_minutes':0,'active':False})
    assert zero['price_cents']==0 and zero['duration_minutes']==0
    expect('PUT',path,{'version':3,'active':True},409)
    empty=expect('PUT',path,{'version':4,'price_cents':None,'duration_minutes':None})
    assert empty['price_cents'] is None and empty['duration_minutes'] is None and empty['active'] is False
    expect('DELETE',path+'?version='+str(empty['version']),status=204)
    expect('PUT',path,{'version':5,'name':'Deleted'},404)
    passed('partial edit preserves prices; zero/null differ; stale activation and deleted target rejected')


if __name__=='__main__': main(verify,'last-procedure-version-smoke.json')
