"""Appointment deletion preconditions and financial preservation via isolated HTTP."""
from uuid import uuid4
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200,session=token):
        code,body=request(method,path,data,token=session)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    patient=expect('POST','/api/patients',{'full_name':'Fictitious deletion patient'},201)
    dentist=expect('POST','/api/dentists',{'full_name':'Fictitious deletion dentist','availability':[
        {'day_of_week':day,'start_time':'00:00','end_time':'23:59'} for day in
        ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')]},201)
    procedure=expect('POST','/api/procedures',{'name':'Fictitious deletion procedure','price_cents':12000},201)
    user=expect('POST','/api/users',{'name':'Fictitious agenda operator','email':'agenda-deletion@example.com','password':password,'role':'reception'},201)
    operator=expect('POST','/api/auth/login',{'email':user['email'],'password':password},session=None)['session']
    permissions=expect('GET','/api/permissions/me',session=operator)['permissions']
    permissions['appointments']['delete']=True
    for action in permissions['financial']: permissions['financial'][action]=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    for index,status in enumerate(('pending','paid')):
        appointment=expect('POST','/api/appointments',{'patient_id':patient['id'],'dentist_id':dentist['id'],
            'procedure_ids':[procedure['id']],'start_at':f'2030-01-07T{12+index*2}:00:00Z',
            'end_at':f'2030-01-07T{13+index*2}:00:00Z'},201)
        path='/api/appointments/'+appointment['id']
        for query in ('','?version=0','?version=-1','?version=abc','?version=1.5'):
            expect('DELETE',path+query,status=422)
        generated_path='/api/financial/from-appointment/'+appointment['id']
        body={'status':status,'idempotency_key':str(uuid4())}
        entry=expect('POST',generated_path,body,201)
        payments=expect('GET','/api/financial/'+entry['id']+'/payments')
        expect('PUT',path,{'version':1,'status':'completed','notes':'Fictitious completed appointment'})
        stale=expect('DELETE',path+'?version=1',status=409,session=operator)
        assert stale['code']=='stale_version'
        assert not any(key in stale for key in ('amount_cents','payments','reference_snapshot'))
        assert expect('GET',path)['procedure_ids']==[procedure['id']]
        expect('GET','/api/financial/'+entry['id'],status=403,session=operator)
        expect('DELETE',path+'?version=2',status=204,session=operator)
        expect('DELETE',path+'?version=2',status=404,session=operator)
        expect('GET',path,status=404)
        current=expect('GET','/api/financial/'+entry['id'])
        assert current['appointment_id'] is None and current['version']==entry['version']
        assert current['reference_snapshot']==entry['reference_snapshot']
        assert current['total_cents']==entry['total_cents'] and current['status']==entry['status']
        assert expect('GET','/api/financial/'+entry['id']+'/payments')==payments
        replay=expect('POST',generated_path,body,201)
        assert replay['id']==entry['id'] and replay['appointment_id'] is None
        expect('POST',generated_path,{'status':status,'idempotency_key':str(uuid4())},404)
        assert sql(f'SELECT count(*) FROM "{schema}".appointment_procedures WHERE appointment_id=\'{appointment["id"]}\'')=='0'
        passed(status+': stale deletion rejected, current deletion preserves money/history/receipts; no financial permission required')
    permissions['appointments']['delete']=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    expect('DELETE',path+'?version=2',status=403,session=operator)
    passed('appointment delete permission revocation takes effect in existing session')


if __name__=='__main__':main(verify,'last-appointment-deletion-smoke.json')
