"""Verify the real Windows backup cannot reopen writes while homolog gateway is stopped."""
import json
import ssl
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from uuid import uuid4
from smoke_backup_restore_homolog import ROOT, PROJECT, run, fingerprint


def main():
    compose = ['docker', 'compose', '--project-name', PROJECT, '--env-file', str(ROOT / '.env.homolog'),
               '-f', str(ROOT / 'docker-compose.homolog.yml')]
    names = {service: PROJECT + '-' + service + '-1' for service in ('api', 'gateway', 'edge')}
    for name in names.values():
        info = json.loads(run('docker', 'inspect', name))[0]
        assert info['Config']['Labels']['com.docker.compose.project'] == PROJECT
        assert info['State']['Running'], 'Do not change an already stopped environment.'
    context = ssl.create_default_context(cafile=str(ROOT / '.data/tls/homolog/ca.crt'))

    def status(path='/health'):
        try:
            with urlopen('https://localhost:18443' + path, context=context, timeout=5) as response:
                return response.status
        except HTTPError as error:
            return error.code
        except TimeoutError:
            return 0  # A stopped upstream can wait for the proxy's connection timeout.

    def blocked():
        assert not json.loads(run('docker', 'inspect', names['gateway']))[0]['State']['Running']
        assert status() in (0, 502, 504) and status('/api/patients') in (0, 502, 504)

    assert status() == 200
    before = fingerprint('erp_dents_homolog')
    backup = ROOT / '.data' / ('update-gate-' + uuid4().hex)
    try:
        run(*compose, 'stop', '-t', '60', 'gateway')
        blocked()
        result = subprocess.run(['powershell', '-NoProfile', '-File', str(ROOT / 'scripts/backup-server.ps1'),
            '-Environment', 'homolog', '-Destination', str(backup)], capture_output=True)
        if result.returncode:
            # Report only the known safe Docker verb, never raw PowerShell output.
            match = re.search(rb'Operacao Docker falhou \(([a-z]+)\): ([a-zA-Z ]+)\.', result.stderr)
            operation = (match.group(1) + b': ' + match.group(2)).decode() if match else 'unknown'
            raise RuntimeError('Windows backup failed at safe operation: ' + operation)
        assert json.loads(run('docker', 'inspect', names['api']))[0]['State']['Running']
        blocked()
        run(sys.executable, str(ROOT / 'scripts/smoke_backup_restore_homolog.py'), str(backup))
        # Existing failure injection also restarts API; the gateway must stay closed.
        run('powershell', '-NoProfile', '-File', str(ROOT / 'scripts/test-backup-failure-homolog.ps1'))
        blocked()
        assert fingerprint('erp_dents_homolog') == before
        backup.with_suffix('.result.json').write_text(json.dumps({'passed': True,
            'checks': ['gateway blocks HTTP', 'real Windows backup', 'restore comparison',
                       'backup failure keeps gateway blocked', 'original rows preserved']}, indent=2))
        print('PASS: real Windows backup and failure restart API without reopening gateway; restore and source rows verified.', flush=True)
    finally:
        run(*compose, 'start', 'gateway')
        for _ in range(60):
            try:
                if status() == 200:
                    print('PASS: homolog gateway reopened and trusted HTTPS healthy.', flush=True)
                    break
            except (URLError, ConnectionError):
                pass
            time.sleep(.5)
        else:
            raise RuntimeError('Gateway restarted but HTTPS is not healthy; keep maintenance.')


if __name__ == '__main__':
    main()
