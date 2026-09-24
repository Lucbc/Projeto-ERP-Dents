"""Patient edit conflicts through isolated HTTP requests."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method,path,data=None,status=200):
        if method == 'DELETE' and path.startswith('/api/patients/') and '?' not in path:
            from patient_deletion_homolog import patient_deletion_path
            path = patient_deletion_path(lambda url: expect('GET', url), path)
        code,body=request(method,path,data,token=token)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    patient=expect('POST','/api/patients',{'full_name':'Fictitious Version Patient'},201)
    path='/api/patients/'+patient['id']
    assert patient['version']==1
    for body in ({'notes':'Draft'},{'version':None},{'version':0},{'version':True},{'version':'1'}):
        expect('PUT',path,body,422)
    assert expect('GET',path)['version']==1
    passed('version is required and invalid preconditions never mutate the patient')
    gate=Barrier(2,timeout=10)
    def worker(note):
        gate.wait()
        return request('PUT',path,{'version':1,'notes':note},token=token)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,['Draft A','Draft B']))
    assert sorted(code for code,_ in results)==[200,409]
    winner=next(body for code,body in results if code==200)
    assert winner['version']==2
    current=expect('GET',path)
    assert current['notes']==winner['notes']
    expect('PUT',path,{'version':1,'notes':'Stale'},409)
    assert expect('GET',path)['notes']==winner['notes']
    passed('two HTTP drafts produce one save and one conflict, preserving the winner')
    current=expect('PUT',path,{'version':current['version'],'notes':'Reviewed draft'})
    assert current['version']==3
    expect('PUT',path,{'version':2,'notes':'Retry'},409)
    expect('DELETE',path,status=204)
    expect('PUT',path,{'version':3,'notes':'Deleted'},404)
    passed('reload version allows reviewed edit; stale retries and deleted targets cannot overwrite')


if __name__=='__main__': main(verify,'last-patient-concurrency-smoke.json')
