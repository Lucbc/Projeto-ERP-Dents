"""Real release image update using ONLY private resources of the installation harness."""
import base64
import hashlib
import io
import json
import shutil
import subprocess
import tarfile
import time
from urllib.error import URLError
from smoke_backup_restore_homolog import ROOT, PROJECT, run


def prepare_images(folder):
    releases = {'old': 'piloto-cadastros-v0.1.1', 'new': 'piloto-cadastros-v0.1.2'}
    # This acceptance is specifically a no-migration application update.
    unchanged = ['docker-compose.yml', 'ops', 'apps/api/alembic', 'apps/web',
                 'apps/api/Dockerfile', 'apps/api/requirements.txt']
    if run('git', 'diff', '--name-only', releases['old'], releases['new'], '--', *unchanged).strip():
        raise RuntimeError('This harness requires identical deployment/schema/frontend between releases.')
    images = {'releases': releases}
    for label, tag in releases.items():
        source = folder / label
        source.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run('git', 'archive', tag))) as archive:
            archive.extractall(source, filter='data')
        images[label] = {}
        for service in ('api', 'web'):
            if label == 'new' and service == 'web':
                images[label][service] = images['old'][service]
                continue
            image = PROJECT + '-update-' + folder.name + '-' + label + '-' + service
            print('Building isolated release image: ' + label + '/' + service, flush=True)
            run('docker', 'build', '-q', '-t', image, str(source / 'apps' / service))
            images[label][service] = run('docker', 'image', 'inspect', '--format', '{{.Id}}', image).decode().strip()
    if images['old']['api'] == images['new']['api']:
        raise RuntimeError('Expected different API release images.')
    return images


def verify_update(folder, environment, tls, config, names, volumes, compose, images,
                  client, request, ready, patient, settings, credentials):
    def compose_run(*args):
        return run(*compose, *args, input=json.dumps(config).encode())

    containers = {key: value['container_name'] for key, value in
                  ((name, config['services'][service]) for name, service in names.items())}
    assert all(name.startswith(PROJECT + '-install_') for name in containers.values())
    assert all(name.startswith(PROJECT + '_install_') for name in volumes.values())
    db = containers['db']
    user, database = settings['POSTGRES_USER'], settings['POSTGRES_DB']

    def sql(query, target=database):
        return run('docker', 'exec', '-i', db, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
                   '-U', user, '-d', target, '-At', input=query.encode()).decode().strip()

    def fingerprint(target=database):
        result = {}
        for table in sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename", target).splitlines():
            quoted = '"' + table.replace('"', '""') + '"'
            result[table] = sql("SELECT count(*)::text || ':' || md5(coalesce(string_agg("
                                "row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) "
                                f'FROM public.{quoted} t', target)
        return result

    patient = request('PUT', '/api/patients/' + patient['id'],
                      {'version': patient['version'], 'cpf': '123.456.789-01', 'preferred_name': 'Update Social Fictitious'})
    assert request('GET', '/api/patients?search=12345678901')['total'] == 0
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=')
    boundary = 'update-fixture'
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n').encode() + png + f'\r\n--{boundary}--\r\n'.encode()
    exam = request('POST', '/api/patients/' + patient['id'] + '/exams', body, 201,
                   {'Content-Type': 'multipart/form-data; boundary=' + boundary})
    assert request('GET', '/api/exams/' + exam['id'] + '/download') == png
    before = fingerprint()
    protected_files = [environment, *(tls / name for name in ('server.crt', 'server.key', 'ca.crt'))]
    hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected_files}
    original_mounts = {name: json.loads(run('docker', 'inspect', containers[name]))[0]['Mounts'] for name in ('db', 'api')}
    backup = folder / 'backup'
    backup.mkdir()
    sid = run('powershell', '-NoProfile', '-Command', '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value').decode().strip()
    run('icacls', str(backup), '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F',
        '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F')
    (backup / 'INCOMPLETE').touch()
    started = time.monotonic()
    compose_run('stop', '-t', '60', names['gateway'], names['api'])

    def blocked():
        assert not json.loads(run('docker', 'inspect', containers['gateway']))[0]['State']['Running']
        try:
            if client.request('GET', '/health', timeout=2)[0] in (502, 504):
                return
        except (URLError, ConnectionError, TimeoutError):
            return
        raise RuntimeError('Public API must remain unavailable during maintenance.')

    blocked()
    helper = PROJECT + '-update-archive-' + folder.name
    restore_db = 'update_restore_check'
    try:
        run('docker', 'exec', db, 'sh', '-c', 'umask 077; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/update.dump')
        run('docker', 'cp', db + ':/tmp/update.dump', str(backup / 'database.dump'))
        run('docker', 'create', '--name', helper, '--label', 'com.docker.compose.project=' + PROJECT,
            '--network', 'none', '--user', '0:0', '--mount', 'type=volume,src=' + volumes['exams_data'] + ',dst=/source,readonly',
            images['old']['api'], 'python', '-c',
            'import tarfile; t=tarfile.open("/tmp/exams.tar","w"); t.add("/source",arcname="exams"); t.close()')
        run('docker', 'start', '-a', helper)
        assert run('docker', 'inspect', '--format', '{{.State.ExitCode}}', helper).strip() == b'0'
        run('docker', 'cp', helper + ':/tmp/exams.tar', str(backup / 'exams.tar'))
        shutil.copyfile(environment, backup / 'server.env')
        shutil.copytree(tls, backup / 'tls')
        # Restore the dump into a separate database in this test's NEW DB container.
        run('docker', 'exec', db, 'createdb', '-U', user, restore_db)
        run('docker', 'exec', db, 'pg_restore', '-U', user, '-d', restore_db, '--no-owner', '--no-acl', '--exit-on-error', '/tmp/update.dump')
        assert fingerprint(restore_db) == before
        with tarfile.open(backup / 'exams.tar') as archive:
            assert any(archive.extractfile(member).read() == png for member in archive.getmembers() if member.isfile())
        manifest = {p.relative_to(backup).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in backup.rglob('*') if p.is_file() and p.name != 'INCOMPLETE'}
        (backup / 'test-manifest.json').write_text(json.dumps({'kind': 'private-update-test', 'files': manifest}, indent=2))
        (backup / 'INCOMPLETE').unlink()
        print('PASS: API access blocked, private backup restored and all public rows compared.', flush=True)
        # Reproduce backup tool's API restart: gateway must still be stopped.
        compose_run('start', names['api'])
        blocked()
        compose_run('stop', '-t', '60', names['api'])
        for service in ('api', 'exam-storage-init'):
            config['services'][names[service]]['image'] = images['new']['api']
        compose_run('up', '-d', '--no-build', '--no-deps', names['api'])
        blocked()
        # Explicitly recreate proxies after API replacement to refresh upstream DNS.
        compose_run('up', '-d', '--no-build', '--no-deps', '--force-recreate', names['gateway'], names['web'])
        compose_run('up', '-d', '--no-build', '--no-deps', '--force-recreate', names['edge'])
        ready()
        assert fingerprint() == before
        assert {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected_files} == hashes
        for name in ('db', 'api'):
            assert json.loads(run('docker', 'inspect', containers[name]))[0]['Mounts'] == original_mounts[name]
        assert json.loads(run('docker', 'inspect', containers['api']))[0]['Image'] == images['new']['api']
        assert request('GET', '/api/patients/' + patient['id']) == patient
        assert request('GET', '/api/exams/' + exam['id'] + '/download') == png
        for term in ('12345678901', 'Update%20Social%20Fictitious'):
            found = request('GET', '/api/patients?search=' + term)
            assert found['total'] == 1 and found['items'][0]['id'] == patient['id']
        assert request('GET', '/api/auth/needs-bootstrap')['needsBootstrap'] is False
        request('PUT', '/api/patients/' + patient['id'], {'version': patient['version'], 'notes': 'Fictitious post-update edit'})
        status, identity, _ = client.request('POST', '/api/auth/login', credentials)
        assert status == 200
        assert client.request('GET', '/api/auth/me', session=identity['session'])[0] == 200
        elapsed = round(time.monotonic() - started, 2)
        (folder / 'result.json').write_text(json.dumps({'passed': True, 'releases': images['releases'],
            'maintenanceSeconds': elapsed, 'checks': ['backup restored', 'gateway blocked during backup/replacement',
            'all public rows preserved', 'same volumes/config/TLS', 'old session and exam preserved', 'new search', 'edit', 'fresh login'],
            'limits': ['private harness backup, not backup-server.ps1', 'API/HTTPS, no browser',
                       'no new migration', 'cached images/signatures', 'no physical clinic installation']}, indent=2))
        print(f'PASS: release update, preserved rows/volumes/config/TLS/exam/session, new search and edit; maintenance {elapsed}s.', flush=True)
    finally:
        if subprocess.run(['docker', 'inspect', helper], capture_output=True).returncode == 0:
            run('docker', 'rm', '-f', helper)


if __name__ == '__main__':
    from smoke_windows_install_homolog import main
    main(upgrade=True)
