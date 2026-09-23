"""Versioned catalog DELETE contracts through a disposable HTTP API."""
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200,session=token):
        code,body=request(method,path,data,token=session)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    user=expect('POST','/api/users',{'name':'Fictitious catalog reader','email':'catalog-reader@example.com','password':password,'role':'reception'},201)
    reader=expect('POST','/api/auth/login',{'email':user['email'],'password':password},session=None)['session']
    permissions=expect('GET','/api/permissions/me',session=reader)['permissions']
    for resource in ('procedures','specialties'): permissions[resource]['delete']=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    for resource in ('procedures','specialties'):
        path='/api/'+resource
        item=expect('POST',path,{'name':'Fictitious deletion '+resource},201)
        endpoint=path+'/'+item['id']
        for query in ('','?version=0','?version=-1','?version=abc','?version=1.5'):
            expect('DELETE',endpoint+query,status=422)
        expect('DELETE',endpoint+'?version=1',status=403,session=reader)
        updated=expect('PUT',endpoint,{'version':1,'name':'Fictitious updated '+resource})
        assert expect('DELETE',endpoint+'?version=1',status=409)['code']=='stale_version'
        assert expect('GET',endpoint)['name']==updated['name']
        expect('DELETE',endpoint+'?version=2',status=204)
        expect('DELETE',endpoint+'?version=2',status=404)
        passed(resource+': required version, permission, stale conflict, current deletion and absent result verified')
    procedure=expect('POST','/api/procedures',{'name':'Fictitious linked procedure'},201)
    patient=expect('POST','/api/patients',{'full_name':'Fictitious catalog patient'},201)
    dentist=expect('POST','/api/dentists',{'full_name':'Fictitious catalog dentist','availability':[
        {'day_of_week':day,'start_time':'00:00','end_time':'23:59'} for day in
        ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')]},201)
    appointment=expect('POST','/api/appointments',{'patient_id':patient['id'],'dentist_id':dentist['id'],
        'procedure_ids':[procedure['id']],'start_at':'2030-01-07T12:00:00Z','end_at':'2030-01-07T13:00:00Z'},201)
    endpoint='/api/procedures/'+procedure['id']
    assert expect('DELETE',endpoint+'?version=1',status=409)['code']=='linked_record'
    assert expect('GET',endpoint)['version']==1
    assert expect('GET','/api/appointments/'+appointment['id'])['procedure_ids']==[procedure['id']]
    passed('linked procedure deletion remains blocked and does not change catalog or appointment')


if __name__=='__main__': main(verify,'last-catalog-deletion-smoke.json')
