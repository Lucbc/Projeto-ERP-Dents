"""Concurrent appointment edits and procedure preservation through isolated HTTP."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200):
        code,body=request(method,path,data,token=token)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    patient=expect('POST','/api/patients',{'full_name':'Fictitious Appointment Version Patient'},201)
    dentist=expect('POST','/api/dentists',{'full_name':'Fictitious Version Dentist','availability':[
        {'day_of_week':'monday','start_time':'08:00','end_time':'18:00'}]},201)
    procedures=[expect('POST','/api/procedures',{'name':'Fictitious version procedure','price_cents':1000},201)['id'] for _ in range(2)]
    appointment=expect('POST','/api/appointments',{'patient_id':patient['id'],'dentist_id':dentist['id'],
        'start_at':'2030-01-07T13:00:00Z','end_at':'2030-01-07T14:00:00Z'},201)
    path='/api/appointments/'+appointment['id']
    for data in ({'notes':'Stale'},{'version':None},{'version':0},{'version':True},{'version':'1'}): expect('PUT',path,data,422)
    passed('appointment version is required and invalid preconditions do not mutate')
    gate=Barrier(2,timeout=10)
    def worker(i):
        gate.wait()
        return request('PUT',path,{'version':1,'notes':str(i),'procedure_ids':[procedures[i]]},token=token)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
    assert sorted(code for code,_ in results)==[200,409]
    winner=next(body for code,body in results if code==200)
    current=expect('GET',path)
    assert current['version']==2 and current['notes']==winner['notes'] and current['procedure_ids']==winner['procedure_ids']
    expect('PUT',path,{'version':1,'status':'cancelled','procedure_ids':[]},409)
    assert expect('GET',path)['procedure_ids']==winner['procedure_ids']
    passed('concurrent edits commit one matching set of fields and procedures; stale cancellation rejected')
    current=expect('PUT',path,{'version':2,'notes':'Reviewed'})
    assert current['version']==3 and current['procedure_ids']==winner['procedure_ids']
    current=expect('PUT',path,{'version':3,'status':'cancelled'})
    expect('PUT',path,{'version':3,'status':'scheduled'},409)
    assert expect('GET',path)['status']=='cancelled'
    expect('DELETE',path+'?version=4',status=204)
    expect('PUT',path,{'version':4,'notes':'Deleted'},404)
    passed('reviewed edit preserves links; old reactivation and edits after deletion cannot overwrite')


if __name__=='__main__': main(verify,'last-appointment-version-smoke.json')
