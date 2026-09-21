"""Version and uniqueness errors through an isolated specialty HTTP API."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200):
        code,body=request(method,path,data,token=token)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    specialty=expect('POST','/api/specialties',{'name':'Fictitious Version Specialty'},201)
    other=expect('POST','/api/specialties',{'name':'Fictitious Other Specialty'},201)
    assert specialty['version']==1
    path='/api/specialties/'+specialty['id']
    for data in ({},{'version':None},{'version':0},{'version':True},{'version':'1'}): expect('PUT',path,data,422)
    assert expect('GET',path)['version']==1
    passed('specialty version required; invalid preconditions preserve catalog')
    assert expect('POST','/api/specialties',{'name':other['name']},409)['code']=='specialty_name_exists'
    assert expect('PUT',path,{'version':1,'name':other['name'],'active':False},409)['code']=='specialty_name_exists'
    current=expect('GET',path)
    assert (current['version'],current['name'],current['active'])==(1,specialty['name'],True)
    expect('PUT',path,{'version':1,'active':None},422)
    assert expect('GET',path)['version']==1
    passed('duplicate create/update classified separately; failed writes preserve name, activation and version')
    gate=Barrier(2,timeout=10)
    def worker(index):
        gate.wait()
        return request('PUT',path,{'version':1,'name':f'Concurrent {index}','active':bool(index)},token=token)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
    assert sorted(code for code,_ in results)==[200,409]
    assert next(body for code,body in results if code==409)['code']=='stale_version'
    winner=next(body for code,body in results if code==200)
    current=expect('GET',path)
    assert current['version']==2 and all(current[key]==winner[key] for key in ('name','active'))
    # A stale edit must not be misclassified as a duplicate name.
    assert expect('PUT',path,{'version':1,'name':other['name']},409)['code']=='stale_version'
    reviewed=expect('PUT',path,{'version':2,'name':'Reviewed'})
    assert reviewed['version']==3 and reviewed['active']==winner['active']
    listed=expect('GET','/api/specialties')['items']
    assert next(row['version'] for row in listed if row['id']==specialty['id'])==3
    expect('DELETE',path,status=204)
    expect('PUT',path,{'version':3,'name':'Deleted'},404)
    passed('two edits produce one winner; stale version is distinct; partial review, list and deleted target verified')


if __name__=='__main__': main(verify,'last-specialty-version-smoke.json')
