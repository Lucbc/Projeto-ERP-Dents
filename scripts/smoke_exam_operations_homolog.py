"""Antivirus/quota integration in disposable schemas and files, no real records."""
import base64
import secrets
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from smoke_bootstrap_homolog import main, docker
from smoke_exams_homolog import PNG

EICAR = base64.b64decode('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=')


def checks(unavailable=False):
    def verify(request, email, password, token, container, ready, passed, sql, schema):
        def expect(method, path, payload=None, status=200, headers=None):
            code, body = request(method, path, payload, token=token, extra_headers=headers)
            assert code in (status if isinstance(status, tuple) else (status,)), f'{method}: expected {status}, got {code}'
            return body
        patient = expect('POST', '/api/patients', {'full_name': 'Fictitious Operations Patient'}, 201)
        path = '/api/patients/' + patient['id'] + '/exams'
        def upload(data, name='test.png', status=201):
            boundary = secrets.token_hex(12)
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                    'Content-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
            return expect('POST', path, body, status, {'Content-Type': 'multipart/form-data; boundary=' + boundary})
        if unavailable:
            upload(PNG, status=503)
            assert expect('GET', path) == []
            assert request.last_headers is not None
            passed('unavailable antivirus rejects upload without creating metadata')
        else:
            rejected = upload(EICAR, status=400)
            assert 'seguran' in rejected['detail']
            assert expect('GET', path) == []
            passed('real EICAR is blocked before any file publication')
            # Valid format markers and safe padding; tests byte quota, not PDF rendering.
            pdf = b'%PDF-1.4\n%' + b'a' * 680 + b'\n%%EOF'
            exam = upload(pdf, 'quota.pdf')
            upload(pdf, 'quota.pdf', status=507)
            assert len(expect('GET', path)) == 1
            expect('DELETE', '/api/exams/' + exam['id'], status=204)
            with ThreadPoolExecutor(max_workers=6) as pool:
                attempts = list(pool.map(lambda _: upload(pdf, 'quota.pdf', status=(201, 503, 507)), range(6)))
            successful = [item for item in attempts if 'id' in item]
            assert len(successful) == 1
            assert len(expect('GET', path)) == 1
            replacement = successful[0]
            expect('DELETE', '/api/exams/' + replacement['id'], status=204)
            passed('quota rejects overflow under six concurrent uploads; deletion restores capacity')
        # A legacy file is subject to scanning too. Insert only in this disposable schema.
        exam_id, filename = str(uuid4()), str(uuid4()) + '.png'
        content = PNG if unavailable else EICAR
        code = ('from pathlib import Path; import base64; '
                f'p=Path("/tmp/bootstrap-exams/{patient["id"]}/{filename}"); '
                f'p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(base64.b64decode("{base64.b64encode(content).decode()}"))')
        docker('exec', container, 'python', '-c', code)
        sql(f'''INSERT INTO "{schema}".exams (id,patient_id,original_filename,stored_filename,mime_type,size_bytes,uploaded_at)
                VALUES ('{exam_id}','{patient['id']}','legacy.png','{filename}','image/png',{len(content)},now())''')
        expect('GET', '/api/exams/' + exam_id + '/download', status=503 if unavailable else 400)
        assert len(expect('GET', path)) == 1
        passed('legacy download fails closed and preserves file metadata')
        if not unavailable:
            holder = ('from src.adapters.db.database import engine; '
                      'from src.adapters.db.exam_maintenance import exam_storage_lock; '
                      'from pathlib import Path; import time\n'
                      'with exam_storage_lock(engine):\n'
                      ' Path("/tmp/exam-lock-ready").touch()\n'
                      ' deadline=time.monotonic()+10\n'
                      ' while time.monotonic()<deadline and not Path("/tmp/exam-lock-release").exists(): time.sleep(.05)\n')
            with ThreadPoolExecutor(1) as pool:
                future = pool.submit(docker, 'exec', container, 'python', '-c', holder)
                try:
                    for _ in range(30):
                        if docker('exec', container, 'test', '-f', '/tmp/exam-lock-ready', check=False).returncode == 0: break
                        time.sleep(.1)
                    else: raise AssertionError('Storage lock holder did not start')
                    expect('DELETE', '/api/exams/' + exam_id, status=503)
                    expect('DELETE', '/api/patients/' + patient['id'], status=503)
                    assert len(expect('GET', path)) == 1
                finally:
                    docker('exec', container, 'touch', '/tmp/exam-lock-release')
                    future.result()
            passed('exam/patient deletion cannot race a maintenance transaction; records preserved')
        expect('DELETE', '/api/exams/' + exam_id, status=204)
        if not unavailable:
            orphan = str(uuid4()) + '.png'
            code = ('from pathlib import Path; import base64,os,time; '
                    f'p=Path("/tmp/bootstrap-exams/{patient["id"]}/{orphan}"); '
                    f'p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(base64.b64decode("{base64.b64encode(PNG).decode()}")); '
                    'os.utime(p,(time.time()-90000,)*2)')
            docker('exec', container, 'python', '-c', code)
            archived = f'/tmp/bootstrap-exams/.quarantine/{patient["id"]}/{orphan}'
            for _ in range(40):
                if docker('exec', container, 'test', '-f', archived, check=False).returncode == 0:
                    break
                time.sleep(.5)
            else:
                raise AssertionError('Periodic maintenance did not quarantine orphan')
            docker('exec', container, 'python', '-m', 'scripts.maintain_exams',
                   '--restore-patient', patient['id'], '--restore-file', orphan)
            docker('exec', container, 'python', '-c',
                   f'from pathlib import Path; import base64; assert Path("/tmp/bootstrap-exams/{patient["id"]}/{orphan}").read_bytes()==base64.b64decode("{base64.b64encode(PNG).decode()}")')
            passed('running API periodically quarantines crash orphan; CLI restores exact bytes')
        expect('DELETE', '/api/patients/' + patient['id'], status=204)
    return verify


if __name__ == '__main__':
    main(checks(), 'last-exam-operations-smoke.json', {'EXAM_MAX_BYTES': '1024', 'EXAM_QUOTA_BYTES': '1024', 'EXAM_MAINTENANCE_SECONDS': '10'})
    main(checks(unavailable=True), 'last-exam-antivirus-outage-smoke.json', {'CLAMAV_HOST': '127.0.0.1'})
