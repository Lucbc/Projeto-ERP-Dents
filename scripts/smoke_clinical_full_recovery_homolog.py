"""Windows operational backup and full private recovery, fictional data only."""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import tarfile
import time
from urllib.error import URLError
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

from cookie_client import CookieClient
from smoke_clinical_recovery_homolog import run, PROJECT, DB
from smoke_backup_restore_homolog import fingerprint
from smoke_homolog import ROOT, STATE, verify_target


def main():
    verify_target()
    operation = uuid4().hex
    prefix = PROJECT + '-full-' + operation
    database, restored = 'clinical_full_' + operation, 'clinical_restored_' + operation
    volumes = [prefix + '-exams', prefix + '-restored-exams']
    directory = STATE / ('full-recovery-' + operation)
    directory.mkdir()
    # Restrict the fixture configuration as well as the backup made by PowerShell.
    protection = '''$d=Get-Item -LiteralPath $args[0]; $a=New-Object Security.AccessControl.DirectorySecurity;
$a.SetAccessRuleProtection($true,$false);
foreach($s in @([Security.Principal.WindowsIdentity]::GetCurrent().User,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
$a.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }; Set-Acl -LiteralPath $d.FullName -AclObject $a'''
    acl_script = directory / 'protect.ps1'
    acl_script.write_text(protection, encoding='utf8')
    run('powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(acl_script), str(directory))
    current = json.loads(run('docker', 'image', 'inspect', PROJECT + '-api'))[0]['Id']
    web_image = json.loads(run('docker', 'image', 'inspect', PROJECT + '-web'))[0]['Id']
    main_api = json.loads(run('docker', 'inspect', PROJECT + '-api-1'))[0]
    original = dict(item.split('=', 1) for item in main_api['Config']['Env'] if '=' in item)
    settings = {'JWT_SECRET_KEY': secrets.token_hex(32), 'BOOTSTRAP_TOKEN': secrets.token_hex(32),
                'PUBLIC_ORIGIN': 'https://localhost:18444', 'CORS_ORIGINS': 'https://localhost:18444',
                'EXAMS_BASE_PATH': '/data/exams', 'CLAMAV_HOST': PROJECT + '-clamav-1'}
    password = secrets.token_urlsafe(24)
    source_api, source_web = prefix + '-api', prefix + '-web'
    containers, databases = [], []
    before = fingerprint('erp_dents_homolog')
    checks = []
    def passed(message):
        checks.append(message)
        print('OK: ' + message, flush=True)
    def remove(name):
        if name in containers:
            run('docker', 'rm', '-f', name)
            containers.remove(name)
    def start_api(name, db, volume, config, mount='/data/exams'):
        values = dict(config)
        values['DATABASE_URL'] = urlunsplit(urlsplit(values.get('DATABASE_URL', original['DATABASE_URL']))._replace(path='/' + db))
        args = ['docker', 'run', '-d', '--name', name, '--label', 'com.docker.compose.project=' + PROJECT,
                '--label', 'erp.homolog.fixture=' + operation, '--network', PROJECT + '_default',
                '--mount', 'type=volume,src=' + volume + ',dst=' + mount]
        for key in values:
            args += ['-e', key]
        containers.append(name)
        run(*args, current, env={**os.environ, **values})
        return values
    def start_web(name, api, tls):
        nginx = directory / (name + '.conf')
        nginx.write_text('server { listen 443 ssl; server_name localhost; '
            'ssl_certificate /etc/erp-tls/server.crt; ssl_certificate_key /etc/erp-tls/server.key; '
            'client_max_body_size 21m; root /usr/share/nginx/html; index index.html; '
            'location /api/ { proxy_pass http://' + api + ':8000; proxy_set_header Host $host; } '
            'location = /health { proxy_pass http://' + api + ':8000; } '
            'location / { try_files $uri $uri/ /index.html; } }', encoding='utf8')
        containers.append(name)
        run('docker', 'run', '-d', '--name', name, '--label', 'com.docker.compose.project=' + PROJECT,
            '--label', 'erp.homolog.fixture=' + operation, '--network', PROJECT + '_default',
            '-p', '127.0.0.1:18444:443', '--mount', f'type=bind,src={nginx},dst=/etc/nginx/conf.d/default.conf,readonly',
            '--mount', f'type=bind,src={tls},dst=/etc/erp-tls,readonly', web_image)
        client = CookieClient('https://localhost:18444', origin='https://localhost:18444',
                              context=ssl.create_default_context(cafile=str(tls / 'ca.crt')))
        ready(client)
        return client
    def ready(client):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            try:
                if client.request('GET', '/health', timeout=2)[0] == 200:
                    return
            except (URLError, ConnectionError, TimeoutError):
                pass
            time.sleep(.25)
        raise RuntimeError('Private HTTPS recovery did not become healthy.')
    def prepare_volume(volume):
        run('docker', 'volume', 'create', '--label', 'com.docker.compose.project=' + PROJECT,
            '--label', 'erp.homolog.fixture=' + operation, volume)
        run('docker', 'run', '--rm', '--label', 'com.docker.compose.project=' + PROJECT, '--network', 'none',
            '--user', '0:0', '--mount', 'type=volume,src=' + volume + ',dst=/data',
            '-e', 'EXAMS_BASE_PATH=/data', current, 'python', '-m', 'scripts.prepare_exam_storage')
    try:
        for db in (database, restored):
            run('docker', 'exec', DB, 'createdb', '-U', 'erp_homolog', db)
            databases.append(db)
        for volume in volumes:
            prepare_volume(volume)
        values = start_api(source_api, database, volumes[0], settings)
        (directory / 'server.env').write_text(''.join(k + '=' + v + '\n' for k, v in values.items()), encoding='utf8')
        client = start_web(source_web, source_api, ROOT / '.data/tls/homolog')
        def call(method, path, data=None, session=None, expected=200, headers=None):
            status, body, _ = client.request(method, path, data, session, headers)
            assert status == expected, f'Full recovery HTTP expected {expected}, received {status}'
            return body
        call('POST', '/api/auth/bootstrap-admin', {'name': 'Fictitious Full Recovery Admin',
             'email': 'full-admin@example.com', 'password': password}, headers={'X-Bootstrap-Token': settings['BOOTSTRAP_TOKEN']})
        admin = call('POST', '/api/auth/login', {'email': 'full-admin@example.com', 'password': password})['session']
        def create(resource, data):
            return call('POST', '/api/' + resource, data, admin, 201)
        patient = create('patients', {'full_name': 'Fictitious Full Recovery Patient', 'allergies': 'Fictitious recovered allergy'})
        dentist = create('dentists', {'full_name': 'Fictitious Full Recovery Dentist', 'availability': [
            {'day_of_week': 'monday', 'start_time': '10:00', 'end_time': '12:00'}]})
        author = create('users', {'name': 'Fictitious Full Recovery Author', 'email': 'full-author@example.com',
            'password': password, 'role': 'dentist', 'dentist_id': dentist['id']})
        visits = [create('appointments', {'patient_id': patient['id'], 'dentist_id': dentist['id'],
            'start_at': f'2030-01-{day}T13:00:00Z', 'end_at': f'2030-01-{day}T13:30:00Z'}) for day in ('07', '14')]
        grants = next(row for row in call('GET', '/api/permissions', session=admin)['items'] if row['role'] == 'dentist')
        grants['permissions']['clinical_records'] = dict(view=True, create=True, update=True, delete=False)
        call('PUT', '/api/permissions/dentist', grants, admin)
        author_session = call('POST', '/api/auth/login', {'email': author['email'], 'password': password})['session']
        records = [call('POST', '/api/clinical-records/from-appointment/' + visit['id'],
            {'key': str(uuid4()), 'text': 'Fictitious recovered draft'}, author_session, 201) for visit in visits]
        endpoint = '/api/clinical-records/' + records[0]['id']
        call('POST', endpoint + '/finalize', {'key': str(uuid4()), 'version': 1}, author_session)
        attempt = {'key': str(uuid4()), 'version': 2, 'text': 'Fictitious recovered addendum', 'reason': 'Fictitious correction'}
        final = call('POST', endpoint + '/addenda', attempt, author_session)
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=')
        def upload():
            boundary = 'recovery-' + operation
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="fictional.png"\r\nContent-Type: image/png\r\n\r\n').encode() + png + f'\r\n--{boundary}--\r\n'.encode()
            return call('POST', '/api/patients/' + patient['id'] + '/exams', body, admin, 201,
                        {'Content-Type': 'multipart/form-data; boundary=' + boundary})
        exam = upload()
        assert call('GET', '/api/exams/' + exam['id'] + '/download', session=admin) == png
        passed('Private HTTPS source contains clinical draft/finalization/addendum and scanned fictional exam')
        fixture = directory / 'fixture.json'
        fixture.write_text(json.dumps({'operation': operation, 'api': source_api, 'edge': source_web,
            'database': database, 'examVolume': volumes[0]}), encoding='utf8')
        for environment, fixture_path in (('prod', fixture), ('homolog', directory / 'invalid.json')):
            if fixture_path != fixture:
                fixture_path.write_text(json.dumps({'operation': operation, 'api': PROJECT + '-api-1',
                    'edge': source_web, 'database': database, 'examVolume': volumes[0]}), encoding='utf8')
            denied = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                str(ROOT / 'scripts/backup-server.ps1'), '-Environment', environment, '-Destination', str(directory / 'denied'),
                '-HomologFixture', str(fixture_path)], capture_output=True)
            assert denied.returncode != 0 and not (directory / 'denied').exists()
        passed('Fixture mode rejects production environment and main-container identifiers before maintenance')
        snapshot = fingerprint(database)
        backup = directory / 'backup'
        run('powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(ROOT / 'scripts/backup-server.ps1'),
            '-Environment', 'homolog', '-Destination', str(backup), '-HomologFixture', str(fixture))
        ready(client)
        manifest = json.loads((backup / 'manifest.json').read_text(encoding='utf8'))
        assert manifest['project'] == PROJECT and manifest['format'] == 1
        assert not (backup / 'INCOMPLETE').exists()
        assert set(manifest['files']) == {'database.dump', 'exams.tar', 'server.env', 'tls/server.crt', 'tls/server.key', 'tls/ca.crt'}
        for name, digest in manifest['files'].items():
            assert hashlib.sha256((backup / name).read_bytes()).hexdigest().upper() == digest
        assert (backup / 'server.env').read_bytes() == (directory / 'server.env').read_bytes()
        assert fingerprint(database) == snapshot
        passed('Actual Windows backup script completes manifest/configuration/TLS/archive and restarts only private API')
        remove(source_web)
        remove(source_api)
        remote = '/tmp/full-recovery-' + operation + '.dump'
        try:
            run('docker', 'cp', str(backup / 'database.dump'), DB + ':' + remote)
            run('docker', 'exec', DB, 'pg_restore', '-U', 'erp_homolog', '-d', restored,
                '--no-owner', '--no-acl', '--exit-on-error', remote)
        finally:
            run('docker', 'exec', DB, 'rm', '-f', remote)
        assert fingerprint(restored) == snapshot
        helper = prefix + '-extract'
        containers.append(helper)
        code = '''import hashlib,json,pathlib,tarfile
with tarfile.open('/backup/exams.tar') as t:
 assert all(m.isfile() or m.isdir() for m in t.getmembers())
 t.extractall('/data',filter='data')
p=pathlib.Path('/data/exams')
print(json.dumps({str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in p.rglob('*') if f.is_file()}))'''
        run('docker', 'create', '--name', helper, '--label', 'com.docker.compose.project=' + PROJECT,
            '--network', 'none', '--user', '0:0', '--mount', 'type=volume,src=' + volumes[1] + ',dst=/data',
            '--mount', f'type=bind,src={backup},dst=/backup,readonly', current, 'python', '-c', code)
        hashes = json.loads(run('docker', 'start', '-a', helper))
        with tarfile.open(backup / 'exams.tar') as archive:
            expected_hashes = {m.name.removeprefix('exams/'): hashlib.sha256(archive.extractfile(m).read()).hexdigest()
                               for m in archive.getmembers() if m.isfile()}
        assert hashes == expected_hashes and hashlib.sha256(png).hexdigest() in hashes.values()
        remove(helper)
        prepare_volume(volumes[1])
        restored_values = dict(line.split('=', 1) for line in (backup / 'server.env').read_text().splitlines())
        start_api(prefix + '-r-api', restored, volumes[1], restored_values, mount='/data')
        client = start_web(prefix + '-r-web', prefix + '-r-api', backup / 'tls')
        admin = call('POST', '/api/auth/login', {'email': 'full-admin@example.com', 'password': password})['session']
        author_session = call('POST', '/api/auth/login', {'email': author['email'], 'password': password})['session']
        assert call('GET', endpoint, session=author_session) == final
        assert call('POST', endpoint + '/addenda', attempt, author_session) == final
        assert all(fingerprint(restored)[t] == snapshot[t] for t in ('clinical_records', 'clinical_addenda', 'clinical_operations'))
        assert call('GET', '/api/exams/' + exam['id'] + '/download', session=admin) == png
        new_exam = upload()
        assert call('GET', '/api/exams/' + new_exam['id'] + '/download', session=admin) == png
        passed('Restored configuration/TLS, original accounts, clinical receipt replay and old/new exam bytes pass HTTPS API')
        result = subprocess.run(['node', str(ROOT / 'scripts/smoke_clinical_full_recovery_homolog.cjs')],
            input=json.dumps({'email': author['email'], 'password': password, 'patientId': patient['id']}),
            text=True, capture_output=True, env={**os.environ, 'NODE_EXTRA_CA_CERTS': str(backup / 'tls/ca.crt')})
        if result.returncode:
            raise RuntimeError('Restored clinical Chrome acceptance failed; sensitive diagnostics withheld.')
        passed('Chrome restored login, clinical history, original/addendum/context and draft editing approved')
        run('docker', 'restart', prefix + '-r-api')
        ready(client)
        assert call('GET', '/api/exams/' + new_exam['id'] + '/download', session=admin) == png
        assert call('GET', '/api/clinical-records/' + records[1]['id'], session=author_session)['text'] == 'Fictitious browser restored edit'
        assert fingerprint(database) == snapshot
        passed('Restored restart preserves browser draft edit and exam; source unchanged')
    finally:
        for name in list(reversed(containers)):
            remove(name)
        for db in reversed(databases):
            run('docker', 'exec', DB, 'dropdb', '-U', 'erp_homolog', db)
        assert fingerprint('erp_dents_homolog') == before
    passed('Private containers/databases removed; main database and containers preserved; test volumes retained')
    (STATE / 'last-clinical-full-recovery.json').write_text(json.dumps({'checks': checks, 'project': PROJECT,
        'backup': str(directory / 'backup'), 'retained_volumes': volumes}, indent=2), encoding='utf8')


if __name__ == '__main__':
    main()
