"""Restore a homolog-only backup into a private database and a NEW retained volume.

With --application, connects private API/web containers to the restored data.
Never prints records/secrets or overwrites existing databases/volumes.
Python is a developer test dependency.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import subprocess
import tarfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'erp-dents-homolog'
DB_CONTAINER = 'erp-dents-homolog-db-1'


def run(*args, input=None, env=None):
    result = subprocess.run(args, input=input, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError('Restore check command failed; output withheld to protect data.')
    return result.stdout


def sql(database, query):
    return run('docker', 'exec', '-i', DB_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
               '-U', 'erp_homolog', '-d', database, '-At', input=query.encode()).decode().strip()


def fingerprint(database):
    tables = sql(database, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
    result = {}
    for table in tables:
        quoted = '"' + table.replace('"', '""') + '"'
        result[table] = sql(database, 'SELECT count(*)::text || \':\' || md5(coalesce('
                            'string_agg(row_to_json(t)::text, \'\' ORDER BY row_to_json(t)::text), \'\')) '
                            f'FROM public.{quoted} t')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('backup', type=Path)
    parser.add_argument('--application', action='store_true', help='Also test restored API/HTTPS/browser in isolation')
    args = parser.parse_args()
    backup = args.backup.resolve()
    if not backup.is_relative_to((ROOT / '.data').resolve()):
        raise RuntimeError('Test accepts only local .data backups with fictional data.')
    manifest = json.loads((backup / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('format') != 1 or manifest.get('project') != PROJECT or (backup / 'INCOMPLETE').exists():
        raise RuntimeError('Only complete homolog backups are accepted.')
    required = {'database.dump', 'exams.tar', 'server.env', 'tls/server.crt', 'tls/server.key'}
    if not required <= set(manifest['files']) <= required | {'tls/ca.crt'}:
        raise RuntimeError('Unexpected backup file set.')
    for name, expected in manifest['files'].items():
        path = backup / name
        if path.is_symlink() or not path.resolve().is_relative_to(backup):
            raise RuntimeError('Unexpected backup path.')
        with path.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest().upper() != expected:
                raise RuntimeError('Backup integrity check failed.')
    info = json.loads(run('docker', 'inspect', DB_CONTAINER))[0]
    if info['Config']['Labels'].get('com.docker.compose.project') != PROJECT:
        raise RuntimeError('Unexpected database project.')
    if not any(m.get('Name') == PROJECT + '_postgres_data' for m in info['Mounts']):
        raise RuntimeError('Unexpected database volume.')
    image = run('docker', 'inspect', '--format', '{{.Image}}', PROJECT + '-api-1').decode().strip()
    archive_image = manifest.get('archiveImage', image)
    if not isinstance(archive_image, str) or not re.fullmatch(r'sha256:[a-f0-9]{64}', archive_image):
        raise RuntimeError('Unexpected archive helper image identifier.')
    before = fingerprint('erp_dents_homolog')
    if not before:
        raise RuntimeError('Source database must contain representative fictional records.')
    identifier = uuid.uuid4().hex
    database = 'restore_' + identifier
    volume = PROJECT + '-restore-' + identifier
    helper = PROJECT + '-restore-check-' + identifier
    remote_dump = '/tmp/restore-' + identifier + '.dump'
    created_db = created_helper = False
    try:
        run('docker', 'exec', DB_CONTAINER, 'createdb', '-U', 'erp_homolog', database)
        created_db = True
        run('docker', 'cp', str(backup / 'database.dump'), DB_CONTAINER + ':' + remote_dump)
        run('docker', 'exec', DB_CONTAINER, 'pg_restore', '-U', 'erp_homolog', '-d', database,
            '--no-owner', '--no-acl', '--exit-on-error', remote_dump)
        if fingerprint(database) != before:
            raise RuntimeError('Restored public rows differ from source; do not approve recovery.')
        run('docker', 'volume', 'create', '--label', 'com.docker.compose.project=' + PROJECT,
            '--label', 'erp.restore-test=true', volume)
        code = '''import hashlib,json,pathlib,tarfile
with tarfile.open('/tmp/exams.tar') as archive:
    if any(not (m.isfile() or m.isdir()) for m in archive.getmembers()):
        raise RuntimeError('Unexpected archive entry')
    archive.extractall('/restore', filter='data')
base=pathlib.Path('/restore/exams')
print(json.dumps({p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in base.rglob('*') if p.is_file()},sort_keys=True))
'''
        run('docker', 'create', '--name', helper, '--label', 'com.docker.compose.project=' + PROJECT,
            '--network', 'none', '--user', '0:0', '--mount', f'type=volume,src={volume},dst=/restore', archive_image, 'python', '-c', code)
        created_helper = True
        run('docker', 'cp', str(backup / 'exams.tar'), helper + ':/tmp/exams.tar')
        restored_files = json.loads(run('docker', 'start', '-a', helper))
        if run('docker', 'inspect', '--format', '{{.State.ExitCode}}', helper).strip() != b'0':
            raise RuntimeError('Exam restore failed.')
        with tarfile.open(backup / 'exams.tar') as archive:
            expected_files = {m.name.removeprefix('exams/'): hashlib.sha256(archive.extractfile(m).read()).hexdigest()
                              for m in archive.getmembers() if m.isfile()}
        if restored_files != expected_files:
            raise RuntimeError('Restored exam bytes differ from archive.')
        if args.application:
            from restore_application_homolog import verify_application
            verify_application(backup, database, volume, image)
        if fingerprint('erp_dents_homolog') != before:
            raise RuntimeError('Source changed during restore check.')
        print('PASS: manifest integrity, all public table rows, exam archive bytes and source preservation.')
        print('Private restored volume retained for inspection: ' + volume)
        if not args.application:
            print('No application/browser recovery validated; configuration/TLS copied but not activated.')
    finally:
        if created_helper:
            run('docker', 'rm', helper)
        run('docker', 'exec', DB_CONTAINER, 'rm', '-f', remote_dump)
        if created_db:
            # Only the random database created by this invocation, never public/source.
            run('docker', 'exec', DB_CONTAINER, 'dropdb', '-U', 'erp_homolog', database)


if __name__ == '__main__':
    main()
