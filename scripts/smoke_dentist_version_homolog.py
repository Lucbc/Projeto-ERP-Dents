"""Versioned dentist edits with schedule preservation in an isolated HTTP API."""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200):
        code,body=request(method,path,data,token=token)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    dentist=expect('POST','/api/dentists',{'full_name':'Fictitious Version Dentist'},201)
    path='/api/dentists/'+dentist['id']
    for data in ({'phone':'Draft'},{'version':None},{'version':0},{'version':True},{'version':'1'}): expect('PUT',path,data,422)
    assert expect('GET',path)['version']==1
    passed('dentist version is required and invalid preconditions do not mutate')
    gate=Barrier(2,timeout=10)
    def worker(index):
        gate.wait()
        return request('PUT',path,{'version':1,'specialty':str(index),'availability':[
            {'day_of_week':'monday','start_time':f'{8+index:02}:00','end_time':'18:00'}]},token=token)
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
    assert sorted(code for code,_ in results)==[200,409]
    winner=next(body for code,body in results if code==200)
    current=expect('GET',path)
    assert current['version']==2 and current['specialty']==winner['specialty'] and current['availability']==winner['availability']
    expect('PUT',path,{'version':1,'availability':[],'specialty':'Stale'},409)
    assert expect('GET',path)['availability']==winner['availability']
    passed('concurrent full edits keep one matching specialty and schedule; stale draft cannot clear hours')
    current=expect('PUT',path,{'version':2,'phone':'Reviewed'})
    assert current['version']==3 and current['availability']==winner['availability']
    expect('PUT',path,{'version':3,'active':False})
    expect('PUT',path,{'version':3,'active':True},409)
    assert expect('GET',path)['active'] is False
    expect('DELETE',path+'?version='+str(expect('GET',path)['version']),status=204)
    expect('PUT',path,{'version':4,'phone':'Deleted'},404)
    passed('reviewed partial edit preserves schedule; stale activation and deleted targets cannot overwrite')


if __name__=='__main__': main(verify,'last-dentist-version-smoke.json')
