"""Clinical and administrative audit upgrade/dump recovery in private databases.

Requires erp-dents-homolog-pilot-v24 built from the installation tag and current
erp-dents-homolog-api. Does not restart main containers or mount any volume.
This checks database recovery only, not the operational backup/exam archive.
"""
import json
import os
import secrets
import subprocess
import time
from urllib.error import URLError
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from cookie_client import CookieClient
from smoke_homolog import STATE, verify_target
from smoke_backup_restore_homolog import fingerprint, sql

PROJECT = 'erp-dents-homolog'
DB = PROJECT + '-db-1'
PILOT = PROJECT + '-pilot-v24'
PILOT_COMMIT = 'aedbde07ee72f1740994026feaf449b464d9510c'


def run(*args, env=None, input=None):
    result = subprocess.run(args, input=input, env=env, capture_output=True)
    if result.returncode:
        raise RuntimeError('Isolated clinical recovery command failed; raw output withheld.')
    return result.stdout


def main():
    verify_target()
    info = json.loads(run('docker', 'inspect', DB))[0]
    assert info['Config']['Labels']['com.docker.compose.project'] == PROJECT
    assert any(m.get('Name') == PROJECT + '_postgres_data' for m in info['Mounts'])
    pilot = json.loads(run('docker', 'image', 'inspect', PILOT))[0]
    assert pilot['Config']['Labels']['erp.test.source'] == PILOT_COMMIT
    current = json.loads(run('docker', 'image', 'inspect', PROJECT + '-api'))[0]['Id']
    api = json.loads(run('docker', 'inspect', PROJECT + '-api-1'))[0]
    original = dict(item.split('=', 1) for item in api['Config']['Env'] if '=' in item)
    suffix = uuid4().hex
    source, restored = 'clinical_upgrade_' + suffix, 'clinical_restore_' + suffix
    container = PROJECT + '-clinical-recovery-' + suffix[:12]
    archive = '/tmp/clinical-recovery-' + suffix + '.dump'
    settings = {'JWT_SECRET_KEY': secrets.token_hex(32), 'BOOTSTRAP_TOKEN': secrets.token_hex(32),
                'PUBLIC_ORIGIN': 'https://localhost:18443', 'EXAMS_BASE_PATH': '/tmp/fictional-exams'}
    password = secrets.token_urlsafe(24)
    client = CookieClient('http://127.0.0.1:18001')
    created = []
    running = False
    checks = []
    main_before = fingerprint('erp_dents_homolog')

    def passed(message):
        checks.append(message)
        print('OK: ' + message, flush=True)

    def call(method, path, data=None, session=None, expected=200, headers=None):
        status, body, _ = client.request(method, path, data, session, headers)
        assert status == expected, f'Clinical recovery HTTP expected {expected}, received {status}'
        return body

    def stop():
        nonlocal running
        if running:
            run('docker', 'rm', '-f', container)
            running = False

    def start(image, database, migrate_only=False, revision="head"):
        nonlocal running
        stop()
        url = urlsplit(original['DATABASE_URL'])
        values = {**settings, 'DATABASE_URL': urlunsplit(url._replace(path='/' + database))}
        args = ['docker', 'run', '--name', container, '--label', 'com.docker.compose.project=' + PROJECT,
                '--network', PROJECT + '_default']
        args += ['--rm'] if migrate_only else ['-d', '-p', '127.0.0.1:18001:8000']
        for key in values:
            args += ['-e', key]
        args += [image]
        if migrate_only:
            args += ['alembic', 'upgrade', revision]
        run(*args, env={**os.environ, **values})
        if migrate_only:
            return
        running = True
        for _ in range(160):
            try:
                call('GET', '/api/auth/needs-bootstrap')
                return
            except (URLError, ConnectionError):
                time.sleep(.25)
        raise RuntimeError('Private clinical recovery API did not become ready.')

    try:
        for database in (source, restored):
            run('docker', 'exec', DB, 'createdb', '-U', 'erp_homolog', database)
            created.append(database)
        start(pilot['Id'], source)
        assert sql(source, 'SELECT version_num FROM alembic_version') == '0025_patient_creation_operations'
        call('POST', '/api/auth/bootstrap-admin', {'name': 'Fictitious Recovery Admin',
             'email': 'recovery-admin@example.com', 'password': password},
             headers={'X-Bootstrap-Token': settings['BOOTSTRAP_TOKEN']})
        admin = call('POST', '/api/auth/login', {'email': 'recovery-admin@example.com', 'password': password})['session']
        def create(resource, data):
            return call('POST', '/api/' + resource, data, admin, 201)
        patient = create('patients', {'full_name': 'Fictitious Recovery Patient', 'birth_date': '1990-01-15',
                                     'allergies': 'Fictitious preserved allergy', 'medical_history': 'Fictitious history'})
        specialty = create('specialties', {'name': 'Fictitious Recovery Specialty'})
        dentist = create('dentists', {'full_name': 'Fictitious Recovery Dentist', 'specialty_ids': [specialty['id']],
                          'availability': [{'day_of_week': 'monday', 'start_time': '10:00', 'end_time': '12:00'}]})
        procedure = create('procedures', {'name': 'Fictitious Recovery Procedure', 'price_cents': 15000, 'duration_minutes': 30})
        author = create('users', {'name': 'Fictitious Recovery Author', 'email': 'recovery-author@example.com',
                                 'password': password, 'role': 'dentist', 'dentist_id': dentist['id']})
        visits = [create('appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
                   'procedure_ids': [procedure['id']], 'start_at': f'2030-01-{day}T13:00:00Z',
                   'end_at': f'2030-01-{day}T13:30:00Z'}) for day in ('07', '14', '21')]
        financial = call('POST', '/api/financial/from-appointment/' + visits[0]['id'], {}, admin, 201)
        stop()
        before = fingerprint(source)
        start(current, source, migrate_only=True, revision="0026_clinical_records")
        after = fingerprint(source)
        assert all(after[table] == value for table, value in before.items() if table != 'alembic_version')
        assert set(after) - set(before) == {'clinical_records', 'clinical_addenda', 'clinical_operations'}
        assert sql(source, 'SELECT version_num FROM alembic_version') == '0026_clinical_records'
        passed('0025 to 0026 preserves every pre-existing table row; three empty clinical tables added')
        # SQL-only inherited draft fixture at 0026; not a claim of a pre-upgrade HTTP write.
        inherited_id = str(uuid4())
        sql(source, f"""INSERT INTO clinical_records
            (id,appointment_id,patient_id,dentist_id,author_id,author_name,text,version,created_at,updated_at)
            VALUES ('{inherited_id}','{visits[2]['id']}','{patient['id']}','{dentist['id']}','{author['id']}',
                    'Fictitious Recovery Author','Fictitious inherited draft',1,now(),now())""")
        before_audit = fingerprint(source)
        start(current, source, migrate_only=True, revision="0027_administrative_audit")
        after_audit = fingerprint(source)
        assert all(after_audit[table] == value for table, value in before_audit.items() if table != 'alembic_version')
        assert set(after_audit) - set(before_audit) == {'administrative_audit'}
        assert sql(source, 'SELECT version_num FROM alembic_version') == '0027_administrative_audit'
        assert sql(source, 'SELECT count(*) FROM administrative_audit') == '0'
        passed('0026 to 0027 preserves every existing row including inherited clinical draft, without fabricated events')
        # SQL-only metadata fixture at 0027; no invented authenticated historical action.
        legacy_actor = str(uuid4())
        sql(source, f"""INSERT INTO administrative_audit
            (id,actor_id,action,target_user_id,before_version,after_version,changed_fields)
            VALUES ('{uuid4()}','{legacy_actor}','user.updated','{legacy_actor}',1,2,ARRAY['name'])""")
        before_patient_audit = fingerprint(source)
        start(current, source, migrate_only=True)
        after_patient_audit = fingerprint(source)
        assert all(after_patient_audit[t] == v for t,v in before_patient_audit.items() if t != 'alembic_version')
        assert set(after_patient_audit) - set(before_patient_audit) == {'patient_audit'}
        assert sql(source, 'SELECT version_num FROM alembic_version') == '0028_patient_audit'
        assert sql(source, 'SELECT count(*) FROM patient_audit') == '0'
        passed('0027 to 0028 preserves all existing rows including clinical and administrative metadata; patient audit starts empty')

        start(current, source)
        listing = '/api/clinical-records?patient_id=' + patient['id']
        call('GET', listing, session=admin, expected=403)
        grants = call('GET', '/api/permissions', session=admin)['items']
        for row in grants:
            assert not any(row['permissions']['clinical_records'].values())
        assert call('GET', '/api/patients/' + patient['id'], session=admin)['allergies'] == patient['allergies']
        assert call('GET', '/api/financial/' + financial['id'], session=admin)['total_cents'] == 15000
        grant = next(row for row in grants if row['role'] == 'dentist')
        grant['permissions']['clinical_records'] = dict(view=True, create=True, update=True, delete=False)
        call('PUT', '/api/permissions/dentist', grant, admin)
        session = call('POST', '/api/auth/login', {'email': author['email'], 'password': password})['session']
        def draft(visit):
            return call('POST', '/api/clinical-records/from-appointment/' + visit['id'],
                        {'key': str(uuid4()), 'text': 'Fictitious recovery draft',
                         'expected_patient_id': patient['id'], 'appointment_version': visit['version']}, session, 201)
        record, pending = draft(visits[0]), draft(visits[1])
        endpoint = '/api/clinical-records/' + record['id']
        final = call('POST', endpoint + '/finalize', {'key': str(uuid4()), 'version': 1}, session)
        payload = {'key': str(uuid4()), 'version': 2, 'text': 'Fictitious recovery correction', 'reason': 'Fictitious reason'}
        amended = call('POST', endpoint + '/addenda', payload, session)
        assert final['context']['allergies'] == patient['allergies']
        passed('Upgraded API preserves legacy reads, denies clinical access initially and records draft/finalization/addendum')
        assert call('GET', '/api/clinical-records/' + inherited_id, session=session)['text'] == 'Fictitious inherited draft'
        disposable = create('users', {'name': 'Fictitious Audit Recovery', 'email': 'audit-recovery@example.com',
                                      'role': 'reception', 'password': password})
        call('DELETE', '/api/users/' + disposable['id'] + '?version=1', session=admin, expected=204)
        audit_page = call('GET', '/api/administrative-audit', session=admin)
        assert len(audit_page['items']) == 4 and audit_page['next_cursor'] is None
        assert [item['action'] for item in audit_page['items'][:3]] == ['user.deleted','user.created','permissions.updated']
        call('GET', '/api/administrative-audit', session=session, expected=403)
        passed('Authenticated permission/create/delete writes persist three events; deleted target remains in audit and denied reader is blocked')
        current_patient = call('GET', '/api/patients/' + patient['id'], session=admin)
        saved_patient = call('PUT', '/api/patients/' + patient['id'],
            {'version':current_patient['version'], 'notes':'Fictitious audit recovery edit'}, admin)
        patient_page = call('GET', '/api/patient-audit', session=admin)
        assert len(patient_page['items']) == 1 and patient_page['next_cursor'] is None
        assert patient_page['items'][0]['changed_fields'] == ['notes']
        assert patient_page['items'][0]['after_version'] == saved_patient['version']
        call('GET', '/api/patient-audit', session=session, expected=403)
        stop()
        snapshot = fingerprint(source)
        run('docker', 'exec', DB, 'pg_dump', '-U', 'erp_homolog', '-Fc', '-f', archive, source)
        run('docker', 'exec', DB, 'pg_restore', '-U', 'erp_homolog', '-d', restored,
            '--no-owner', '--no-acl', '--exit-on-error', archive)
        assert fingerprint(restored) == snapshot
        passed('Custom-format dump restores every public table with identical row counts and hashes')
        for statement in (
            "UPDATE clinical_records SET text='Fictitious forbidden rewrite',version=version+1 WHERE finalized_at IS NOT NULL",
            'DELETE FROM clinical_addenda',
            'DELETE FROM clinical_operations',
            "UPDATE administrative_audit SET action='user.deleted'",
            'DELETE FROM administrative_audit',
            'TRUNCATE administrative_audit',
            'UPDATE patient_audit SET action=action',
            'DELETE FROM patient_audit',
            'TRUNCATE patient_audit',
        ):
            rejected = subprocess.run(['docker', 'exec', '-i', DB, 'psql', '-X', '-U', 'erp_homolog',
                '-d', restored, '-v', 'ON_ERROR_STOP=1'],
                input=('BEGIN; ' + statement + '; ROLLBACK;').encode(), capture_output=True)
            assert rejected.returncode != 0, 'Restored clinical database guard did not reject mutation'
        assert fingerprint(restored) == snapshot
        passed('Restored PostgreSQL guards reject clinical rewrites and administrative event UPDATE/DELETE/TRUNCATE')
        start(current, restored)
        # Reauthenticate against restored accounts, rather than relying on old browser cookies.
        restored_admin = call('POST', '/api/auth/login', {'email': 'recovery-admin@example.com', 'password': password})['session']
        assert call('GET', '/api/administrative-audit', session=restored_admin) == audit_page
        passed('Restored audit API preserves event IDs, actors, deleted target, timestamps, versions and permission differences')
        restored_session = call('POST', '/api/auth/login', {'email': author['email'], 'password': password})['session']
        assert call('GET', '/api/patient-audit', session=restored_admin) == patient_page
        call('GET', '/api/patient-audit', session=restored_session, expected=403)
        assert call('GET', '/api/patients/' + patient['id'], session=restored_admin) == saved_patient
        passed('Restored patient edit history preserves event metadata and read denial alongside the saved patient')

        assert call('GET', endpoint, session=restored_session) == amended
        assert call('GET', '/api/clinical-records/' + pending['id'], session=restored_session) == pending
        assert call('POST', endpoint + '/addenda', payload, restored_session) == amended
        clinical = ('clinical_records', 'clinical_addenda', 'clinical_operations')
        replayed = fingerprint(restored)
        assert all(replayed[table] == snapshot[table] for table in clinical)
        call('PUT', endpoint, {'key': str(uuid4()), 'version': 3, 'text': 'Fictitious forbidden overwrite'}, restored_session, 409)
        updated = call('PUT', '/api/clinical-records/' + pending['id'],
                       {'key': str(uuid4()), 'version': 1, 'text': 'Fictitious restored edit'}, restored_session)
        assert updated['version'] == 2
        assert fingerprint(source) == snapshot
        passed('Restored API reads both states, replays receipt without duplication, protects final text and saves draft; source unchanged')
    finally:
        stop()
        run('docker', 'exec', DB, 'rm', '-f', archive)
        for database in reversed(created):
            run('docker', 'exec', DB, 'dropdb', '-U', 'erp_homolog', database)
        assert fingerprint('erp_dents_homolog') == main_before
    passed('Private databases/container/archive removed; main database, containers and volumes preserved')
    (STATE / 'last-clinical-recovery.json').write_text(json.dumps({'project': PROJECT, 'checks': checks,
        'pilot_commit': PILOT_COMMIT, 'current_image': current,
        'scope': 'database and HTTP only; exam files, operational backup and browser pending'}, indent=2), encoding='utf8')


if __name__ == '__main__':
    main()
