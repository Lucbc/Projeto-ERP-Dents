"""Isolated HTTP checks for versioned deletion, account/session links and finance."""
from uuid import uuid4
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200,session=token):
        code,body=request(method,path,data,token=session)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    availability=[{'day_of_week':'monday','start_time':'08:00','end_time':'18:00'}]
    dentist=expect('POST','/api/dentists',{'full_name':'Fictitious deletion dentist','availability':availability},201)
    other=expect('POST','/api/dentists',{'full_name':'Fictitious replacement dentist'},201)
    path='/api/dentists/'+dentist['id']
    user=expect('POST','/api/users',{'name':'Fictitious linked dentist user','email':'dentist-deletion@example.com',
        'password':password,'role':'dentist','dentist_id':dentist['id']},201)
    session=expect('POST','/api/auth/login',{'email':user['email'],'password':password},session=None)['session']
    operator=expect('POST','/api/users',{'name':'Fictitious restricted operator','email':'delete-operator@example.com',
        'password':password,'role':'reception'},201)
    limited=expect('POST','/api/auth/login',{'email':operator['email'],'password':password},session=None)['session']
    permissions=expect('GET','/api/permissions/me',session=limited)['permissions']
    permissions['dentists']['delete']=True
    for resource in ('users','financial'):
        for action in permissions[resource]: permissions[resource][action]=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    payload={'entry_type':'income','description':'Fictitious linked charge','amount_cents':12000,
             'due_date':'2030-01-07','dentist_id':dentist['id'],'status':'paid','idempotency_key':str(uuid4())}
    entry=expect('POST','/api/financial',payload,201); financial='/api/financial/'+entry['id']
    payments=expect('GET',financial+'/payments')
    expect('PUT',path,{'version':1,'full_name':'Fictitious revised dentist',
        'availability':[{'day_of_week':'monday','start_time':'09:00','end_time':'17:00'}]})
    for suffix in ('','?version=0','?version=-1','?version=abc','?version=1.5'):
        expect('DELETE',path+suffix,status=422,session=limited)
    assert expect('DELETE',path+'?version=1',status=409,session=limited)['code']=='stale_version'
    linked=expect('DELETE',path+'?version=2',status=409,session=limited)
    assert linked['code']=='linked_record' and user['email'] not in str(linked)
    assert expect('GET','/api/auth/me',session=session)['dentist_id']==dentist['id']
    expect('GET','/api/consultations/next',session=session)
    assert expect('GET',financial)['dentist_id']==dentist['id']
    expect('PUT','/api/users/'+user['id'],{'is_active':False})
    assert expect('DELETE',path+'?version=2',status=409,session=limited)['code']=='linked_record'
    expect('PUT','/api/users/'+user['id'],{'is_active':True})
    session=expect('POST','/api/auth/login',{'email':user['email'],'password':password},session=None)['session']
    expect('PUT','/api/users/'+user['id'],{'dentist_id':other['id']})
    expect('GET','/api/auth/me',status=401,session=session)
    expect('GET',financial,status=403,session=limited)
    expect('DELETE',path+'?version=2',status=204,session=limited)
    expect('DELETE',path+'?version=2',status=404,session=limited)
    current=expect('GET',financial)
    assert current['dentist_id'] is None
    for field in ('version','status','total_cents','reference_snapshot','active_payment_id'): assert current[field]==entry[field]
    assert expect('GET',financial+'/payments')==payments
    assert expect('POST','/api/financial',payload,201)['id']==entry['id']
    passed('version and account links protected; inactive link blocks; explicit reassignment revokes old session; paid history survives deletion')
    permissions['dentists']['delete']=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    expect('DELETE',path+'?version=2',status=403,session=limited)
    passed('deletion needs no user/financial permission and revocation takes effect in existing session')
    target=expect('POST','/api/dentists',{'full_name':'Fictitious restricted dentist','availability':availability},201)
    patient=expect('POST','/api/patients',{'full_name':'Fictitious restricted patient'},201)
    appointment=expect('POST','/api/appointments',{'patient_id':patient['id'],'dentist_id':target['id'],
        'start_at':'2030-01-07T13:00:00Z','end_at':'2030-01-07T14:00:00Z'},201)
    for status in ('scheduled','completed','cancelled'):
        if appointment['status']!=status:
            appointment=expect('PUT','/api/appointments/'+appointment['id'],{'version':appointment['version'],'status':status})
        assert expect('DELETE','/api/dentists/'+target['id']+'?version=1',status=409)['code']=='linked_record'
        assert expect('GET','/api/dentists/'+target['id'])['availability']==availability
    passed('appointment links block deletion in all tested clinical states and preserve schedule')


if __name__=='__main__':main(verify,'last-dentist-deletion-smoke.json')
