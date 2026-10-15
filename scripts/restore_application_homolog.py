"""Application checks for the private restore harness; never targets production."""
import base64
import json
import os
import ssl
import subprocess
import tarfile
import time
from urllib.parse import quote
from urllib.error import URLError
from uuid import uuid4

from cookie_client import CookieClient
from smoke_backup_restore_homolog import ROOT, PROJECT, run, sql


def verify_application(backup, database, volume, image):
    if not database.startswith('restore_') or not volume.startswith(PROJECT + '-restore-'):
        raise RuntimeError('Private restored resources required.')
    identifier = uuid4().hex
    api = PROJECT + '-restored-api-' + identifier
    web = PROJECT + '-restored-web-' + identifier
    config = ROOT / '.data' / ('restore-nginx-' + identifier + '.conf')
    env = dict(line.split('=', 1) for line in (backup / 'server.env').read_text().splitlines()
               if '=' in line and not line.startswith('#'))
    settings = {
        'DATABASE_URL': 'postgresql+psycopg://erp_homolog:' + quote(env['HOMOLOG_DB_PASSWORD'], safe='')
                        + '@erp-dents-homolog-db-1:5432/' + database,
        'JWT_SECRET_KEY': env['HOMOLOG_JWT_SECRET'],
        'PUBLIC_ORIGIN': 'https://localhost:18444', 'CORS_ORIGINS': 'https://localhost:18444',
        'EXAMS_BASE_PATH': '/data/exams', 'CLAMAV_HOST': 'erp-dents-homolog-clamav-1',
        'TZ': 'America/Sao_Paulo', 'SESSION_COOKIE_NAME': '__Host-erp_restore_test',
    }
    credentials = json.loads((ROOT / '.data/homolog/admin.json').read_text())
    try:
        # tar's safe extraction deliberately strips ownership. Restore the runtime
        # user's access on this NEW volume before starting the non-root API.
        run('docker', 'run', '--rm', '--label', 'com.docker.compose.project=' + PROJECT,
            '--network', 'none', '--user', '0:0', '--mount', f'type=volume,src={volume},dst=/data',
            '-e', 'EXAMS_BASE_PATH=/data', image, 'python', '-m', 'scripts.prepare_exam_storage')
        command = ['docker', 'run', '-d', '--name', api, '--label', 'com.docker.compose.project=' + PROJECT,
                   '--network', PROJECT + '_default', '--mount', f'type=volume,src={volume},dst=/data']
        # Docker reads values from the child's environment; never put credentials
        # in process arguments, diagnostic output or a new local plaintext file.
        for key in settings:
            command.extend(['-e', key])
        run(*command, image, env={**os.environ, **settings})
        config.write_text('''server {
listen 443 ssl; server_name localhost;
ssl_certificate /etc/erp-tls/server.crt;
ssl_certificate_key /etc/erp-tls/server.key;
client_max_body_size 21m;
root /usr/share/nginx/html; index index.html;
location /api/ { proxy_pass http://''' + api + ''':8000; proxy_set_header Host $host; }
location = /health { proxy_pass http://''' + api + ''':8000; }
location / { try_files $uri $uri/ /index.html; }
}''', encoding='utf-8')
        web_image = run('docker', 'inspect', '--format', '{{.Image}}', PROJECT + '-web-1').decode().strip()
        run('docker', 'run', '-d', '--name', web, '--label', 'com.docker.compose.project=' + PROJECT,
            '--network', PROJECT + '_default', '-p', '127.0.0.1:18444:443',
            '--mount', f'type=bind,src={config},dst=/etc/nginx/conf.d/default.conf,readonly',
            '--mount', f'type=bind,src={backup / "tls"},dst=/etc/erp-tls,readonly', web_image)
        client = CookieClient('https://localhost:18444', origin='https://localhost:18444',
                              context=ssl.create_default_context(cafile=str(backup / 'tls/ca.crt')))
        for _ in range(120):
            try:
                if client.request('GET', '/health')[0] == 200:
                    break
            except (URLError, ConnectionError):
                pass
            time.sleep(.25)
        else:
            raise RuntimeError('Restored HTTPS did not become healthy.')
        token = None

        def request(method, path, data=None, expected=200, headers=None):
            status, body, _ = client.request(method, path, data, token, headers)
            if status != expected:
                raise RuntimeError(f'Restored API check failed: expected {expected}, received {status}')
            return body

        assert request('GET', '/api/auth/needs-bootstrap')['needsBootstrap'] is False
        token = request('POST', '/api/auth/login', credentials)['session']
        assert request('GET', '/api/auth/me')['role'] == 'admin'
        patient = request('POST', '/api/patients', {'full_name': 'Fictitious Restored Patient',
                          'birth_date': '1990-01-15'}, expected=201)
        updated = request('PUT', '/api/patients/' + patient['id'],
                          {'version': patient['version'], 'preferred_name': 'Restored'})
        assert updated['birth_date'] == '1990-01-15'
        exams = json.loads(sql(database, "SELECT coalesce(json_agg(e), '[]') FROM (SELECT id, patient_id, stored_filename FROM exams) e"))
        assert exams, 'A restored exam is required for this acceptance.'
        with tarfile.open(backup / 'exams.tar') as archive:
            for exam in exams:
                expected = archive.extractfile('exams/' + exam['patient_id'] + '/' + exam['stored_filename']).read()
                assert request('GET', '/api/exams/' + exam['id'] + '/download') == expected
        # New upload proves write permissions, not merely readability of old files.
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=')
        boundary = 'restore-test-' + identifier
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n').encode() + png + f'\r\n--{boundary}--\r\n'.encode()
        exam = request('POST', '/api/patients/' + patient['id'] + '/exams', body, expected=201,
                       headers={'Content-Type': 'multipart/form-data; boundary=' + boundary})
        assert request('GET', '/api/exams/' + exam['id'] + '/download') == png
        result = subprocess.run(['node', str(ROOT / 'scripts/smoke_restore_browser_homolog.cjs')],
                                input=json.dumps({**credentials, 'patient': patient['full_name']}),
                                text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError('Restored browser check failed; sensitive diagnostics withheld.')
        run('docker', 'restart', api)
        for _ in range(120):
            try:
                if client.request('GET', '/health')[0] == 200:
                    break
            except (URLError, ConnectionError):
                pass
            time.sleep(.25)
        token = request('POST', '/api/auth/login', credentials)['session']
        assert request('GET', '/api/patients/' + patient['id'])['birth_date'] == '1990-01-15'
        assert request('GET', '/api/exams/' + exam['id'] + '/download') == png
        print('PASS: restored trusted HTTPS, original login, patients, old/new exam bytes, Chrome and restart persistence.')
    finally:
        # docker run can create a stopped container before reporting failure.
        for name in (web, api):
            found = subprocess.run(['docker', 'inspect', name], capture_output=True)
            if found.returncode == 0:
                run('docker', 'rm', '-f', name)
        config.unlink(missing_ok=True)
