"""Concurrent appointment HTTP requests in a disposable homologation schema."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def expect(method, path, data=None, status=200):
        code, body = request(method,path,data,token=token)
        assert code == status, f'{method} {path}: expected {status}, got {code}'
        return body
    patients = [expect('POST','/api/patients',{'full_name':'Fictitious Agenda Patient'},201)['id'] for _ in range(2)]
    availability = [{'day_of_week':day,'start_time':'00:00','end_time':'23:59'} for day in
                    ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')]
    dentists = [expect('POST','/api/dentists',{'full_name':'Fictitious Agenda Dentist','availability':availability},201)['id'] for _ in range(2)]
    start = datetime(2030,1,7,12,tzinfo=timezone.utc)
    def payload(p=0,d=0,h=0,status='scheduled'):
        return {'patient_id':patients[p], 'dentist_id':dentists[d], 'status':status,
                'start_at':(start+timedelta(hours=h)).isoformat(), 'end_at':(start+timedelta(hours=h+1)).isoformat()}
    def race(method, paths, bodies, success):
        gate = Barrier(2,timeout=10)
        def worker(index):
            gate.wait()
            return request(method,paths[index],bodies[index],token=token)
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,range(2)))
        assert sorted(code for code,_ in results) == sorted([success,409])
        assert all('Conflito de agenda' in body['detail'] or
                   body['detail'] == 'Outra operação alterou estes dados ao mesmo tempo. Atualize a tela antes de tentar novamente.'
                   for code,body in results if code==409)
        return next(body for code,body in results if code==success)
    race('POST',['/api/appointments']*2,[payload(),payload(p=1)],201)
    passed('concurrent HTTP reservations of one dentist return one 201 and one safe 409')
    race('POST',['/api/appointments']*2,[payload(h=2),payload(d=1,h=2)],201)
    passed('same patient with different dentists cannot reserve overlapping times')
    first=expect('POST','/api/appointments',payload(h=4),201)
    second=expect('POST','/api/appointments',payload(p=1,h=6),201)
    race('PUT',['/api/appointments/'+row['id'] for row in (first,second)],
         [{**payload(h=8),'version':first['version']},{**payload(p=1,h=8),'version':second['version']}],200)
    passed('concurrent HTTP rescheduling preserves both records and rejects the losing edit')
    first=expect('POST','/api/appointments',payload(h=10,status='cancelled'),201)
    second=expect('POST','/api/appointments',payload(p=1,h=10,status='cancelled'),201)
    winner=race('PUT',['/api/appointments/'+row['id'] for row in (first,second)],
                [{'status':'confirmed','version':first['version']},{'status':'scheduled','version':second['version']}],200)
    expect('PUT','/api/appointments/'+winner['id'],{'status':'cancelled','version':winner['version']})
    expect('POST','/api/appointments',payload(h=10),201)
    expect('POST','/api/appointments',payload(h=11),201)
    passed('reactivation conflicts; cancellation releases slot; adjacent bookings remain valid')
    assert sql(f'''SELECT count(*) FROM "{schema}".appointments a JOIN "{schema}".appointments b
        ON a.id < b.id AND (a.dentist_id=b.dentist_id OR a.patient_id=b.patient_id)
        AND a.start_at<b.end_at AND a.end_at>b.start_at
        WHERE a.status<>'cancelled' AND b.status<>'cancelled' ''') == '0'
    passed('database confirms zero active overlap pairs after concurrent HTTP operations')


if __name__ == '__main__': main(verify, 'last-agenda-smoke.json')
