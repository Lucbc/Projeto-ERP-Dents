"""Bounded workload on a private homologation schema; no credentials in reports.

Default: four 60s warmups + 300s measurement windows. --quick only validates
the harness and must never be reported as the capacity acceptance.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta, datetime, timezone
from threading import Barrier, Event, Lock
from time import monotonic
from uuid import uuid4
import argparse
import json
import math
import subprocess

from cookie_client import CookieClient
from smoke_bootstrap_homolog import main, docker
from smoke_financial_history_browser_homolog import verify as browser
import smoke_homolog as smoke


def percentile(values, fraction):
    return round(sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)], 2)


def verify(request, email, password, token, container, ready, passed, sql, schema):
    client = CookieClient('http://127.0.0.1:18001', origin='https://localhost:18444')
    def original_snapshot():
        return [sql(f'''SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'))
                    FROM public.{table} t''') for table in ('patients', 'appointments', 'users')]
    original = original_snapshot()
    samples, resource_samples, results = [], [], []
    guard = Lock()
    report = {'revision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
              'quick': ARGS.quick, 'bounded_patients': ARGS.bounded_patients, 'started_utc': datetime.now(timezone.utc).isoformat(),
              'scenarios': results, 'checks': [], 'transport': 'HTTP localhost private API; Chrome uses TLS proxy'}
    for image in ('api', 'web'):
        report[image + '_image'] = json.loads(docker('image', 'inspect', 'erp-dents-homolog-' + image).stdout)[0]['Id']
    info = json.loads(docker('info', '--format', '{{json .}}').stdout)
    report['docker_resources'] = {k: info[k] for k in ('NCPU', 'MemTotal', 'OperatingSystem', 'ServerVersion')}

    def call(method, path, payload=None, session=token, expected=200, label=None, phase='setup', headers=None):
        start = monotonic()
        try:
            status, body, response_headers = client.request(method, path, payload, session, headers, timeout=30)
        except Exception:
            if label:
                with guard: samples.append((phase, label, (monotonic()-start)*1000, 0, 0))
            raise RuntimeError('Workload transport failure; response details suppressed') from None
        if label:
            with guard:
                samples.append((phase, label, (monotonic()-start)*1000, status,
                                int(response_headers.get('Content-Length', '0'))))
        allowed = (expected,) if isinstance(expected, int) else expected
        assert status in allowed, f'{label or "fixture"}: expected {allowed}, got {status}'
        return body, status

    def fixture(method, path, payload=None, expected=200, session=token):
        # Existing helper supplies version preconditions for user fixtures.
        status, body = request(method, path, payload, token=session)
        assert status == expected, f'fixture: expected {expected}, got {status}'
        return body

    def record_check(label):
        report['checks'].append(label)
        passed(label)

    patient = fixture('POST', '/api/patients', {'full_name': 'Fictitious Load Target',
        'allergies': 'Fictitious allergy', 'medical_history': 'Synthetic context. ' * 30}, 201)
    dentist = fixture('POST', '/api/dentists', {'full_name': 'Fictitious Load Dentist', 'availability': [
        {'day_of_week': 'monday', 'start_time': '08:00', 'end_time': '18:00'}]}, 201)
    accounts, sessions = [], []
    for index in range(10):
        role = 'dentist' if index == 0 else 'reception'
        login = f'load-{index}@example.com'
        fixture('POST', '/api/users', {'name': 'Fictitious Load Operator', 'email': login,
            'password': password, 'role': role, **({'dentist_id': dentist['id']} if index == 0 else {})}, 201)
        accounts.append(login)
    for role in ('reception', 'dentist'):
        matrix = next(r for r in fixture('GET', '/api/permissions')['items'] if r['role'] == role)
        for actions in matrix['permissions'].values():
            for key in actions: actions[key] = False
        for resource in ('dashboard', 'patients', 'dentists', 'procedures', 'appointments', 'clinical_records'):
            matrix['permissions'][resource]['view'] = True
        matrix['permissions']['patients'].update(create=True, update=True)
        matrix['permissions']['appointments']['create'] = True
        if ARGS.bounded_patients:
            matrix['permissions']['appointments']['update'] = True
            matrix['permissions']['calendar']['view'] = True
        matrix['permissions']['clinical_records'].update(create=role == 'dentist', update=role == 'dentist')
        fixture('PUT', '/api/permissions/' + role, matrix)
    for login in accounts:
        sessions.append(call('POST', '/api/auth/login', {'email': login, 'password': password}, session=None)[0]['session'])
    records = []
    for index in range(10):
        day = (date(2030, 1, 7) + timedelta(days=index*7)).isoformat()
        visit = fixture('POST', '/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
            'start_at': day+'T13:00:00Z', 'end_at': day+'T14:00:00Z'}, 201)
        records.append(call('POST', '/api/clinical-records/from-appointment/'+visit['id'],
            {'key': str(uuid4()), 'text': 'Fictitious load evolution. ' * 30}, session=sessions[0], expected=201)[0])
    # Additional agenda rows are fixture data, not API creation acceptance.
    # 300 nonoverlapping Monday appointments across 30 weeks, 10/day.
    sql(f'''INSERT INTO "{schema}".appointments
        (id, patient_id, dentist_id, start_at, end_at, status, created_at, updated_at, version)
        SELECT ('10000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid, '{patient['id']}', '{dentist['id']}',
          date_trunc('week', now()) + (g/10-15)*interval '7 days' + (g%10)*interval '30 minutes' + interval '11 hours',
          date_trunc('week', now()) + (g/10-15)*interval '7 days' + (g%10)*interval '30 minutes' + interval '11 hours 30 minutes',
          'scheduled', now(), now(), 1 FROM generate_series(0,299) g''')
    report['fixture'] = {'appointments': 310, 'clinical_records': 10, 'dentists': 1,
        'note': 'Patient cardinality target; sparse clinical/catalog history, not a mature full ERP database'}
    current_count = 1

    def grow(target):
        nonlocal current_count
        sql(f'''INSERT INTO "{schema}".patients (id,full_name,active,created_at,updated_at,version,medical_history)
            SELECT ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'Fictitious Load '||lpad(g::text,5,'0'),true,
              now()-interval '1 day',now(),1,repeat('Synthetic context. ',30)
            FROM generate_series({current_count},{target-1}) g''')
        current_count = target
        sql(f'ANALYZE "{schema}".patients; ANALYZE "{schema}".appointments')

    def monitor(stop, phase):
        while not stop.is_set():
            stats = docker('stats', '--no-stream', '--format', '{{json .}}', container, 'erp-dents-homolog-db-1')
            # No query text, credentials, names or record contents in metrics.
            activity = sql(f'''SELECT json_build_object('connections',count(*),
                'active',count(*) FILTER(WHERE state='active'),
                'lock_waits',count(*) FILTER(WHERE wait_event_type='Lock'))
                FROM pg_stat_activity WHERE datname='erp_dents_homolog' AND pid<>pg_backend_pid()''')
            locks = sql(f'''SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid=l.relation
                JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='{schema}' AND NOT l.granted''')
            resource_samples.append({'phase': phase, 'seconds': round(monotonic(), 2),
                'containers': [{k: row[k] for k in ('CPUPerc', 'MemUsage', 'PIDs')} for row in
                               map(json.loads, stats.stdout.splitlines())],
                'database': json.loads(activity), 'private_relation_waits': int(locks)})
            stop.wait(5)

    def references(session, phase):
        start = monotonic()
        offset, size = 0, 0
        while True:
            limit = 20 if ARGS.bounded_patients else 200
            page, _ = call('GET', f'/api/patients?limit={limit}&offset={offset}', session=session,
                           label='patient_reference_page', phase=phase)
            size += len(page['items'])
            if ARGS.bounded_patients or size >= page['total']: break
            offset += 200
        assert size == (min(current_count,20) if ARGS.bounded_patients else current_count)
        for route in ('dentists', 'procedures'):
            call('GET', '/api/'+route+'?limit=200&offset=0', session=session, label='catalog_reference', phase=phase)
        with guard: samples.append((phase, 'reference_full_action', (monotonic()-start)*1000, 200, 0))

    today = date.today()
    agenda = f'/api/appointments?from={today-timedelta(days=60)}T00:00:00Z&to={today+timedelta(days=60)}T00:00:00Z'
    clinical = '/api/clinical-records?patient_id='+patient['id']+'&limit=10&offset=0'
    updates = [0]*10

    def tick(index, cycle, phase):
        session = sessions[index]
        # One logout/login per window, concurrently with the other operators.
        # Avoid turning normal usage into a sustained authentication flood.
        if index == 0 and cycle == 2:
            call('POST', '/api/auth/logout', session=session, label='logout', phase=phase)
            sessions[index] = call('POST', '/api/auth/login', {'email': accounts[index], 'password': password},
                session=None, label='login', phase=phase)[0]['session']
            session = sessions[index]
        call('GET', '/api/auth/me', session=session, label='session_read', phase=phase)
        call('GET', '/api/patients?limit=20&offset=0&search=Fictitious', session=session, label='patient_search', phase=phase)
        call('GET', agenda, session=session, label='calendar', phase=phase)
        call('GET', clinical, session=session, label='clinical_history', phase=phase)
        call('GET', '/api/patients/'+patient['id'], session=session, label='patient_detail', phase=phase)
        # One deliberate save/minute/operator, different records except explicit races below.
        if cycle % 4 == 0:
            own_id = f'00000000-0000-4000-8000-{index+1:012d}'
            current, _ = call('GET', '/api/patients/'+own_id, session=session, label='edit_read', phase=phase)
            updated, _ = call('PUT', '/api/patients/'+own_id, {'version': current['version'], 'notes': 'Fictitious load save'},
                              session=session, label='patient_save', phase=phase)
            assert updated['version'] == current['version']+1
            updates[index] += 1
            if index == 0:
                row = records[0]
                records[0], _ = call('PUT', '/api/clinical-records/'+row['id'],
                    {'version': row['version'], 'key': str(uuid4()), 'text': 'Fictitious load saved evolution'},
                    session=session, label='clinical_save', phase=phase)

    def workers(count, seconds, phase, opening=False, external_stop=None):
        gate, stop = Barrier(count), external_stop or Event()
        def worker(index):
            gate.wait(timeout=30)
            if opening: references(sessions[index], phase)
            start = monotonic()
            cycle = 0
            while monotonic()-start < seconds and not stop.is_set():
                tick(index, cycle, phase)
                cycle += 1
                stop.wait(max(0, start+cycle*ARGS.interval-monotonic()))
        with ThreadPoolExecutor(max_workers=count) as pool:
            futures = [pool.submit(worker, i) for i in range(count)]
            for future in futures: future.result()

    def summarize(phase):
        rows = [s for s in samples if s[0] == phase]
        return {name: {'count': len(group), 'p50_ms': percentile([x[2] for x in group], .5),
                      'p95_ms': percentile([x[2] for x in group], .95), 'max_ms': round(max(x[2] for x in group), 2),
                      'statuses': {str(code): sum(x[3] == code for x in group) for code in sorted({x[3] for x in group})},
                      'response_bytes': sum(x[4] for x in group)}
                for name in sorted({s[1] for s in rows}) if (group := [s for s in rows if s[1] == name])}

    def save():
        report['resource_samples'] = resource_samples
        (smoke.STATE/'last-concurrent-usage-metrics.json').write_text(json.dumps(report, indent=2), encoding='utf8')

    for target, count in ((100,1), (5000,1), (5000,5), (5000,10)):
        if target > current_count: grow(target)
        phase = f'{target}-patients-{count}-users'
        print('START:', phase, flush=True)
        stop = Event()
        with ThreadPoolExecutor(max_workers=1) as pool:
            monitoring = pool.submit(monitor, stop, phase)
            try:
                workers(count, ARGS.warmup, phase+'-warmup', opening=True)
                workers(count, ARGS.duration, phase, opening=True)
            finally:
                stop.set()
                monitoring.result()
        results.append({'name': phase, 'warmup_seconds': ARGS.warmup, 'measurement_seconds': ARGS.duration,
                        'metrics': summarize(phase), 'warmup_metrics': summarize(phase+'-warmup')})
        save()
        print('DONE:', phase, json.dumps(results[-1]['metrics']), flush=True)

    # Invariants after the measured windows: concurrent creates/edits + CPF guard.
    gate = Barrier(10)
    def create(index):
        gate.wait(timeout=30)
        return call('POST', '/api/patients', {'full_name': 'Fictitious Concurrent New'}, session=sessions[index],
                    expected=201, headers={'Idempotency-Key': str(uuid4())})[0]
    with ThreadPoolExecutor(max_workers=10) as pool: created = list(pool.map(create, range(10)))
    assert len({p['id'] for p in created}) == 10
    current_count += 10
    race = created[0]
    gate = Barrier(10)
    def edit(index):
        gate.wait(timeout=30)
        return call('PUT', '/api/patients/'+race['id'], {'version': 1, 'notes': 'Fictitious race '+str(index)},
                    session=sessions[index], expected=(200,409))
    with ThreadPoolExecutor(max_workers=10) as pool: edited = list(pool.map(edit, range(10)))
    assert sorted(code for _,code in edited) == [200]+[409]*9
    winner = next(body for body,code in edited if code == 200)
    assert call('GET', '/api/patients/'+race['id'])[0]['notes'] == winner['notes']
    gate = Barrier(10)
    def cpf(index):
        gate.wait(timeout=30)
        return call('POST', '/api/patients', {'full_name': 'Fictitious CPF Race', 'cpf': '52998224725'},
                    session=sessions[index], expected=(201,409))
    with ThreadPoolExecutor(max_workers=10) as pool: cpfs = list(pool.map(cpf, range(10)))
    assert sorted(code for _,code in cpfs) == [201]+[409]*9
    current_count += 1
    assert sql(f'SELECT count(*) FROM "{schema}".patients') == str(current_count)
    assert sql(f'''SELECT count(*) FROM "{schema}".patients WHERE cpf='52998224725' ''') == '1'
    assert sql(f'''SELECT version FROM "{schema}".patients WHERE id='{race['id']}' ''') == '2'
    record_check('API/SQL: ten distinct creates; one winner/nine conflicts for stale edits and repeated CPF; exact patient count')
    call('GET', clinical, session=token, expected=403)
    call('PUT', '/api/clinical-records/'+records[0]['id'],
         {'version': records[0]['version'], 'key': str(uuid4()), 'text': 'Denied'}, session=sessions[1], expected=403)
    record_check('API: administrator without clinical grant and reception clinical write remain denied')

    # Nine HTTP operators plus one Chrome operator: at most ten active operators.
    print('START: Chrome probe with nine background operators', flush=True)
    stop = Event()
    with ThreadPoolExecutor(max_workers=1) as pool:
        background = pool.submit(workers, 9, 120, 'browser-background', False, stop)
        try:
            browser(request,email,password,token,container,ready,passed,sql,schema,
                browser_script='measure_concurrent_usage_homolog.cjs',
                browser_input={'readerEmail': accounts[9], 'patientId': patient['id'], 'boundedPatients': ARGS.bounded_patients})
        finally:
            stop.set()
            background.result()
    report['browser_background'] = summarize('browser-background')
    report['browser'] = json.loads((smoke.STATE/'last-concurrent-usage-browser.json').read_text(encoding='utf8'))
    if ARGS.bounded_patients:
        assert sql(f'''SELECT count(*) FROM "{schema}".appointments WHERE
            patient_id='00000000-0000-4000-8000-000000000001' AND version=2 AND notes='Fictitious verified picker edit' ''') == '1'
        record_check('SQL: browser-created appointment retains out-of-page patient after calendar edit')
    for index, total in enumerate(updates):
        assert sql(f'''SELECT version FROM "{schema}".patients WHERE id='00000000-0000-4000-8000-{index+1:012d}' ''') == str(total+1)
    assert sql(f'''SELECT version FROM "{schema}".clinical_records WHERE id='{records[0]['id']}' ''') == str(records[0]['version'])
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_records') == '10'
    assert sql(f'SELECT count(*) FROM "{schema}".clinical_operations') == str(10+records[0]['version']-1)
    record_check('SQL: every patient save/version and clinical operation receipt accounted for; no lost writes or duplicated records')
    assert original_snapshot() == original
    record_check('SQL: original public patients, appointments and users unchanged')
    report['complete'] = True
    save()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--quick', action='store_true')
    parser.add_argument('--bounded-patients', action='store_true', help='Use the new 20-result appointment picker workload')
    ARGS = parser.parse_args()
    ARGS.warmup, ARGS.duration, ARGS.interval = (0, 1, 1) if ARGS.quick else (60, 300, 15)
    main(verify, 'last-concurrent-usage.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, verify_user_deletion=False)
