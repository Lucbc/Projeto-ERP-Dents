"""Patient deletion preconditions, exam permissions and real bytes in a private API."""
from uuid import uuid4
import secrets
from smoke_bootstrap_homolog import main, docker
from smoke_exams_homolog import PNG


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200, session=token, headers=None):
        code, body = request(method, path, data, token=session, extra_headers=headers)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body
    def patient():
        return expect('POST', '/api/patients', {'full_name':'Fictitious deletion patient'}, 201)
    def upload(p):
        boundary=secrets.token_hex(12)
        data=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fictitious.png"\r\n'
              'Content-Type: image/png\r\n\r\n').encode()+PNG+f'\r\n--{boundary}--\r\n'.encode()
        return expect('POST','/api/patients/'+p['id']+'/exams',data,201,
            headers={'Content-Type':'multipart/form-data; boundary='+boundary})
    def preview(p, session=token):
        return expect('GET','/api/patients/'+p['id']+'/deletion-preview?version='+str(p['version']),session=session)
    def path(view):
        return '/api/patients/'+view['id']+'?version='+str(view['version'])+'&exams_fingerprint='+view['exams_fingerprint']
    p=patient(); old=preview(p); endpoint='/api/patients/'+p['id']
    for query in ('','?version=1','?version=0&exams_fingerprint='+'a'*64,'?version=1&exams_fingerprint=bad'):
        expect('DELETE',endpoint+query,status=422)
    p=expect('PUT',endpoint,{'version':1,'notes':'Fictitious edited note'})
    assert expect('DELETE',path(old),status=409)['code']=='stale_version'
    expect('GET',endpoint+'/deletion-preview?version=1',status=409)
    empty=preview(p); exam=upload(p)
    assert expect('DELETE',path(empty),status=409)['code']=='stale_exams'
    original=preview(p)
    expect('DELETE','/api/exams/'+exam['id'],status=204)
    replacement=upload(p)
    assert expect('DELETE',path(original),status=409)['code']=='stale_exams'
    assert preview(p)['exam_count']==original['exam_count']==1
    passed('missing preconditions rejected; edits, uploads and same-count replacement invalidate old confirmation')

    operator=expect('POST','/api/users',{'name':'Fictitious restricted operator','email':'patient-delete@example.com',
        'password':password,'role':'reception'},201)
    limited=expect('POST','/api/auth/login',{'email':operator['email'],'password':password},session=None)['session']
    permissions=expect('GET','/api/permissions/me',session=limited)['permissions']
    permissions['patients']['delete']=True
    for resource in ('exams','financial'):
        for action in permissions[resource]: permissions[resource][action]=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    expect('GET',endpoint+'/deletion-preview?version=2',status=403,session=limited)
    current=preview(p)
    denied=expect('DELETE',path(current),status=403,session=limited)
    assert replacement['id'] not in str(denied) and 'stored_filename' not in str(denied)
    empty_patient=patient(); limited_preview=preview(empty_patient,limited)
    upload(empty_patient)
    expect('DELETE',path(limited_preview),status=403,session=limited)
    permissions['exams']['delete']=True
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    allowed=preview(p,limited)
    assert set(allowed)=={'id','full_name','version','exam_count','exams_fingerprint'}
    permissions['exams']['delete']=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    expect('DELETE',path(allowed),status=403,session=limited)
    empty_patient=patient(); no_exams=preview(empty_patient,limited)
    expect('DELETE',path(no_exams),status=204,session=limited)
    permissions['patients']['delete']=False
    expect('PUT','/api/permissions/reception',{'permissions':permissions})
    expect('GET',endpoint+'/deletion-preview?version=2',status=403,session=limited)
    expect('DELETE',path(current),status=403,session=limited)
    passed('cascade checks both permissions, including revocation and upload after empty preview; no financial permission required')

    payload={'entry_type':'income','description':'Fictitious paid charge','amount_cents':12000,
        'due_date':'2030-01-07','patient_id':p['id'],'status':'paid','idempotency_key':str(uuid4())}
    entry=expect('POST','/api/financial',payload,201); financial='/api/financial/'+entry['id']
    first=expect('GET',financial+'/payments')[0]
    pending=expect('POST',financial+'/reverse-payment',{'version':1,'payment_id':first['id'],
        'idempotency_key':str(uuid4()),'reason':'Fictitious correction'})['entry']
    paid=expect('POST',financial+'/mark-paid',{'version':pending['version'],'idempotency_key':str(uuid4())})['entry']
    history=expect('GET',financial+'/payments')
    filename=sql(f'''SELECT stored_filename FROM "{schema}".exams WHERE id='{replacement['id']}' ''')
    file='/tmp/bootstrap-exams/'+p['id']+'/'+filename
    assert docker('exec',container,'test','-f',file,check=False).returncode==0
    expect('DELETE',path(current),status=204)
    expect('DELETE',path(current),status=404)
    expect('GET','/api/exams/'+replacement['id']+'/download',status=404)
    assert docker('exec',container,'test','-f',file,check=False).returncode!=0
    after=expect('GET',financial)
    assert after['patient_id'] is None
    for field in ('version','status','total_cents','reference_snapshot','active_payment_id'):
        assert after[field]==paid[field]
    assert expect('GET',financial+'/payments')==history
    assert expect('POST','/api/financial',payload,201)['id']==entry['id']
    passed('reviewed cascade removes exam bytes; paid/reversed/repaid history and idempotent receipt survive')


if __name__=='__main__':
    main(verify,'last-patient-deletion-smoke.json',extra_env={'CLAMAV_HOST':'clamav'})
