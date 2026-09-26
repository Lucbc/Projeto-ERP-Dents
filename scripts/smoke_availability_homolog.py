"""Clock validation and exact boundaries in disposable HTTP API/database."""
import json
from smoke_bootstrap_homolog import main


def verify(request,email,password,token,container,ready,passed,sql,schema):
    def expect(method,path,data=None,status=200):
        code,body=request(method,path,data,token=token)
        assert code==status, f'{method}: expected {status}, got {code}'
        return body
    def slot(start='08:00',end='10:30'):
        return {'day_of_week':'monday','start_time':start,'end_time':end}
    dentist=expect('POST','/api/dentists',{'full_name':'Fictitious Clock Dentist','availability':[slot()]},201)
    path='/api/dentists/'+dentist['id']
    for value in ('25:00','24:00','08:60','8:00','08:00:30',' 08:00','08:00\n'):
        expect('POST','/api/dentists',{'full_name':'Fictitious Invalid Clock','availability':[slot(value,'23:59')]},422)
        expect('PUT',path,{'version':1,'availability':[slot(value,'23:59')]},422)
    assert expect('GET',path)['version']==1
    assert expect('GET',path)['availability']==[slot()]
    passed('invalid real clocks are rejected on create/update without changing version or stored hours')
    patient=expect('POST','/api/patients',{'full_name':'Fictitious Clock Patient'},201)
    data={'patient_id':patient['id'],'dentist_id':dentist['id'],
        'start_at':'2030-01-07T10:00:00-03:00','end_at':'2030-01-07T10:30:00-03:00'}
    for end in ('2030-01-07T10:30:00.000001-03:00','2030-01-07T10:30:59-03:00'):
        expect('POST','/api/appointments',{**data,'end_at':end},409)
    appointment=expect('POST','/api/appointments',data,201)
    apath='/api/appointments/'+appointment['id']
    expect('PUT',apath,{'version':1,'end_at':'2030-01-07T10:30:00.000001-03:00'},409)
    stored=expect('GET',apath)
    assert stored['version']==1 and stored['end_at']==appointment['end_at']
    expect('DELETE',apath+'?version=1',status=204)
    cancelled=expect('POST','/api/appointments',{**data,'end_at':'2030-01-07T11:00:00-03:00','status':'cancelled'},201)
    expect('PUT','/api/appointments/'+cancelled['id'],{'version':1,'status':'scheduled'},409)
    assert expect('GET','/api/appointments/'+cancelled['id'])['status']=='cancelled'
    passed('exact closing boundary accepted; seconds/microseconds rejected on creation, edit and reactivation without partial writes')
    # Fictitious legacy fixture: intentionally bypass new input validation only in this schema.
    legacy=[slot('25:00','26:00'),slot('08:00:30','10:30')]
    sql(f'''UPDATE "{schema}".dentists SET availability='{json.dumps(legacy)}'::json WHERE id='{dentist['id']}' ''')
    assert expect('GET',path)['availability']==legacy
    assert next(row for row in expect('GET','/api/dentists')['items'] if row['id']==dentist['id'])['availability']==legacy
    edited=expect('PUT',path,{'version':1,'phone':'Fictitious legacy maintenance'})
    assert edited['availability']==legacy and edited['version']==2
    expect('POST','/api/appointments',data,409)
    corrected=expect('PUT',path,{'version':2,'availability':[slot()]})
    assert corrected['version']==3 and corrected['availability']==[slot()]
    expect('POST','/api/appointments',data,201)
    passed('legacy hours remain readable and unchanged by unrelated edits; they grant no availability until explicitly corrected')


if __name__=='__main__': main(verify,'last-availability-smoke.json')
