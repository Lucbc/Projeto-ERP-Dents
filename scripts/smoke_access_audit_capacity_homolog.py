"""Measured, synthetic access-audit workload; no production capacity claim.

Runs only through the private erp-dents-homolog bootstrap harness. Candidate
indexes are experimental DDL in that disposable schema, never migrations.
Reports contain aggregate metrics only, not identities, sessions or content.
"""
from concurrent.futures import ThreadPoolExecutor
import json
from math import ceil
from pathlib import Path
from threading import Barrier
from time import perf_counter
from uuid import uuid4

from smoke_bootstrap_homolog import main, docker
from smoke_financial_history_browser_homolog import verify as browser

REPORT = Path(__file__).resolve().parents[1] / '.data/access-capacity-metrics.json'


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def call(method, path, data=None, status=200, session=token):
        code, body = request(method, path, data, token=session)
        assert code == status, f'Capacity request status: expected {status}, got {code}'
        return body

    patient = call('POST', '/api/patients', {'full_name': 'Fictitious Capacity Patient'}, 201)
    dentist = call('POST', '/api/dentists', {'full_name': 'Fictitious Capacity Author',
        'availability': [{'day_of_week': 'monday', 'start_time': '10:00', 'end_time': '12:00'}]}, 201)
    call('POST', '/api/users', {'name': 'Fictitious Capacity Author', 'email': 'capacity-author@example.com',
        'role': 'dentist', 'dentist_id': dentist['id'], 'password': password}, 201)
    sessions = []
    for role in ('dentist', 'reception'):
        permissions = next(row for row in call('GET', '/api/permissions')['items'] if row['role'] == role)
        permissions['permissions']['clinical_records'] = dict(view=True, create=role == 'dentist', update=False, delete=False)
        permissions['permissions']['access_audit'] = dict(view=True, create=False, update=False, delete=False)
        call('PUT', '/api/permissions/' + role, permissions)
    author = call('POST', '/api/auth/login', {'email': 'capacity-author@example.com', 'password': password}, session=None)['session']
    for index in range(10):
        login = f'capacity-{index}@example.com'
        call('POST', '/api/users', {'name': 'Fictitious Capacity Reader', 'email': login,
            'role': 'reception', 'password': password}, 201)
        sessions.append(call('POST', '/api/auth/login', {'email': login, 'password': password}, session=None)['session'])
    visit = call('POST', '/api/appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
        'start_at': '2030-01-07T13:00:00Z', 'end_at': '2030-01-07T14:00:00Z'}, 201)
    record = call('POST', '/api/clinical-records/from-appointment/' + visit['id'],
        {'key': str(uuid4()), 'text': 'Fictitious capacity evolution'}, 201, author)
    # Seed historical volume, explicitly not API-generated events/clinical writes.
    sql(f"""INSERT INTO {schema}.patients SELECT (jsonb_populate_record(NULL::{schema}.patients,
        to_jsonb(p) || jsonb_build_object('id',md5('patient'||n)::uuid,
        'full_name','Fictitious Capacity Patient '||n))).*
        FROM {schema}.patients p CROSS JOIN generate_series(1,4999) n WHERE p.id='{patient['id']}';
        INSERT INTO {schema}.appointments SELECT (jsonb_populate_record(NULL::{schema}.appointments,
        to_jsonb(a) || jsonb_build_object('id',md5('visit'||n)::uuid,
        'start_at',a.start_at+n*interval '7 days','end_at',a.end_at+n*interval '7 days'))).*
        FROM {schema}.appointments a CROSS JOIN generate_series(1,99) n WHERE a.id='{visit['id']}';
        INSERT INTO {schema}.clinical_records SELECT (jsonb_populate_record(NULL::{schema}.clinical_records,
        to_jsonb(r) || jsonb_build_object('id',md5('record'||n)::uuid,
        'appointment_id',md5('visit'||n)::uuid))).*
        FROM {schema}.clinical_records r CROSS JOIN generate_series(1,99) n WHERE r.id='{record['id']}';""")
    assert sql(f'SELECT count(*) FROM {schema}.patients') == '5000'
    actor = call('GET', '/api/auth/me', session=sessions[0])['id']
    sql(f"""INSERT INTO {schema}.access_audit
        (id,occurred_at,actor_id,action,target_id,patient_id,record_ids,record_versions,returned_count,page_limit,page_offset)
        SELECT gen_random_uuid(),'2026-01-01Z'::timestamptz+n*interval '1 second',
        CASE WHEN n%10=0 THEN '{actor}'::uuid ELSE md5('actor'||(n%10))::uuid END,
        CASE WHEN n%4=0 THEN 'exam.download_prepared' ELSE 'clinical.patient_list' END,
        CASE WHEN n%4=0 THEN md5('exam'||(n%5000))::uuid
             WHEN n%5000=1 THEN '{patient['id']}'::uuid ELSE md5('patient'||(n%5000))::uuid END,
        CASE WHEN n%5000=1 THEN '{patient['id']}'::uuid ELSE md5('patient'||(n%5000))::uuid END,
        CASE WHEN n%4=0 THEN ARRAY[]::uuid[] ELSE ARRAY(SELECT md5('record'||i)::uuid FROM generate_series(1,20) i) END,
        CASE WHEN n%4=0 THEN ARRAY[]::bigint[] ELSE array_fill(1::bigint,ARRAY[20]) END,
        CASE WHEN n%4=0 THEN 0 ELSE 20 END, CASE WHEN n%4=0 THEN NULL ELSE 20 END,
        CASE WHEN n%4=0 THEN NULL ELSE 0 END FROM generate_series(1,192000) n;
        ANALYZE {schema}.access_audit; ANALYZE {schema}.patients; ANALYZE {schema}.clinical_records;""")
    def clinical_snapshot():
        return sql(f"SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY id)) FROM {schema}.clinical_records r")
    clinical_before = clinical_snapshot()
    engine = json.loads(docker('info', '--format', '{{json .}}').stdout)
    metrics = {'project': 'erp-dents-homolog', 'patients': 5000, 'synthetic_events': 192000,
               'clients': 10, 'rounds_per_client': 6, 'batches_per_phase': 3,
               'environment': {'docker_cpus': engine['NCPU'], 'docker_memory_bytes': engine['MemTotal'],
                   'api_image': json.loads(docker('inspect', container).stdout)[0]['Image']}, 'phases': {}}
    listing = '/api/clinical-records?patient_id=' + patient['id']
    fields = 'id,occurred_at,actor_id,action,patient_id,target_id,record_ids,record_versions,returned_count,page_limit,page_offset'
    filters = {
        'all': '', 'patient': f"patient_id='{patient['id']}'", 'author': f"actor_id='{actor}'",
        'target_miss': f"target_id='{uuid4()}'", 'action': "action='exam.download_prepared'",
        'time': "occurred_at<'2026-01-02Z'", 'cursor': "(occurred_at,id)<('2026-01-02Z','ffffffff-ffff-ffff-ffff-ffffffffffff')",
    }

    def plans():
        result = {}
        for name, where in filters.items():
            query = f'SELECT {fields} FROM {schema}.access_audit'
            if where: query += ' WHERE ' + where
            query += ' ORDER BY occurred_at DESC,id DESC LIMIT 26'
            samples = []
            for _ in range(3):
                plan = json.loads(sql('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + query))[0]
                samples.append(plan['Execution Time'])
            def nodes(node):
                return [node['Node Type']] + [item for child in node.get('Plans', []) for item in nodes(child)]
            result[name] = {'execution_ms': samples, 'nodes': nodes(plan['Plan']),
                'shared_hit_blocks': plan['Plan'].get('Shared Hit Blocks', 0),
                'shared_read_blocks': plan['Plan'].get('Shared Read Blocks', 0)}
        return result

    def size():
        return json.loads(sql(f"SELECT json_build_object('total_bytes',pg_total_relation_size('{schema}.access_audit'),"
            f"'heap_bytes',pg_relation_size('{schema}.access_audit'),'index_bytes',pg_indexes_size('{schema}.access_audit'))"))

    def workload(label):
        before = int(sql(f'SELECT count(*) FROM {schema}.access_audit'))
        large_before = int(sql(f"SELECT count(*) FROM {schema}.access_audit WHERE occurred_at>'2026-02-01Z' AND returned_count=100"))
        barrier = Barrier(10)
        def worker(index):
            samples = []
            barrier.wait(timeout=10)
            for iteration in range(6):
                for kind, path in [('clinical', listing + ('&limit=100' if iteration%2 == 0 else '&limit=20')),
                                   ('audit', '/api/access-audit' + ('?target_id=' + patient['id'] if iteration%2 else '')),
                                   ('patients', '/api/patients?search=Capacity&limit=20')]:
                    start = perf_counter()
                    body = call('GET', path, session=sessions[index])
                    samples.append((kind, (perf_counter()-start)*1000))
                    assert isinstance(body['items'], list)
                    if kind == 'clinical': assert len(body['items']) == (100 if iteration%2 == 0 else 20)
                if iteration == 2:
                    start = perf_counter()
                    call('POST', '/api/patients', {'full_name': 'Fictitious Capacity Concurrent ' + label}, 201, sessions[index])
                    samples.append(('create_patient', (perf_counter()-start)*1000))
            return samples
        start = perf_counter()
        with ThreadPoolExecutor(max_workers=10) as pool:
            rows = [row for batch in pool.map(worker, range(10)) for row in batch]
        duration = perf_counter()-start
        assert int(sql(f'SELECT count(*) FROM {schema}.access_audit')) - before == 60
        assert int(sql(f"SELECT count(*) FROM {schema}.access_audit WHERE occurred_at>'2026-02-01Z' AND returned_count=100")) - large_before == 30
        assert sql(f"""SELECT count(*) FROM {schema}.access_audit WHERE occurred_at>'2026-02-01Z'
            AND (cardinality(record_ids)<>returned_count OR cardinality(record_versions)<>returned_count
                 OR NOT (1=ALL(record_versions)))""") == '0'
        summary = {}
        for kind in ('clinical', 'audit', 'patients', 'create_patient'):
            values = sorted(ms for name, ms in rows if name == kind)
            summary[kind] = {'count': len(values), 'p50_ms': round(values[ceil(len(values)*.5)-1], 2),
                'p95_ms': round(values[ceil(len(values)*.95)-1], 2), 'max_ms': round(max(values), 2)}
        return {'duration_s': round(duration, 2), 'requests': len(rows), 'latency': summary,
                'p95_under_2s': all(row['p95_ms'] < 2000 for row in summary.values())}

    for label in ('baseline', 'candidate_indexes'):
        if label == 'candidate_indexes':
            for name, columns in [('time', 'occurred_at DESC,id DESC'),
                                  ('target', 'target_id,occurred_at DESC,id DESC'),
                                  ('action', 'action,occurred_at DESC,id DESC')]:
                sql(f'CREATE INDEX candidate_access_{name} ON {schema}.access_audit({columns})')
            sql(f'ANALYZE {schema}.access_audit')
        phase = {'plans': plans(), 'size_before_workload': size(),
                 'http_batches': [workload(label) for _ in range(3)], 'size_after_workload': size()}
        metrics['phases'][label] = phase
        REPORT.write_text(json.dumps(metrics, indent=2), encoding='utf-8')
        passed(label + ': three batches; 570 HTTP requests, 180 clinical audit events and thirty concurrent patient creations verified')
    assert sql(f'SELECT count(*) FROM {schema}.patients') == '5060'
    assert sql(f'SELECT count(*) FROM {schema}.clinical_records') == '100'
    browser_before = int(sql(f'SELECT count(*) FROM {schema}.access_audit'))
    browser(request, email, password, token, container, ready, passed, sql, schema,
        browser_script='smoke_access_audit_polling_browser_homolog.cjs',
        browser_input={'patientId': patient['id'], 'readerEmail': 'capacity-0@example.com'})
    browser_events = int(sql(f'SELECT count(*) FROM {schema}.access_audit')) - browser_before
    assert browser_events >= 2
    assert clinical_snapshot() == clinical_before
    assert sql(f"SELECT count(*) FROM {schema}.access_audit WHERE occurred_at>'2026-02-01Z' AND action<>'clinical.patient_list'") == '0'
    metrics['browser_events'] = browser_events
    REPORT.write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    passed('Chrome periodic refresh produced committed clinical query events; clinical content hash preserved')


if __name__ == '__main__':
    main(verify, 'last-access-capacity.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'},
         versioned_user_fixtures=False, verify_user_deletion=False)
