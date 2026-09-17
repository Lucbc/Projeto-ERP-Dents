"""Verify existing-volume permission transition on a new, disposable volume only."""
import json
from uuid import uuid4
from smoke_bootstrap_homolog import docker
import smoke_homolog as smoke


def main():
    smoke.verify_target()
    volume = 'erp-dents-homolog-storage-test-' + uuid4().hex
    docker('volume', 'create', '--label', 'erp-dents-test=storage-init', volume)
    try:
        program = '''
from pathlib import Path
import os
from scripts.prepare_exam_storage import prepare
base=Path('/data/exams')
(base/'old').write_bytes(b'fictitious preserved bytes')
outside=Path('/tmp/outside')
outside.write_bytes(b'fictitious outside bytes')
(base/'link').symlink_to(outside)
assert (base/'old').stat().st_uid==0
result=prepare(base)
assert result['skipped_links']==1
assert (base/'old').stat().st_uid==10001
assert (base/'old').read_bytes()==b'fictitious preserved bytes'
assert outside.stat().st_uid==0
for invalid in ('/', '/app', '/tmp', '/tmp/unmounted'):
    try: prepare(invalid)
    except ValueError: pass
    else: raise AssertionError('unmounted/unsafe path accepted')
'''
        docker('run','--rm','--user','0:0','-v',volume+':/data/exams','erp-dents-homolog-api','python','-c',program)
        program = '''
import os,shutil,importlib.util
from pathlib import Path
from zoneinfo import ZoneInfo
assert os.getuid()==10001
assert shutil.which('gcc') is None
assert importlib.util.find_spec('pip') is None
assert str(ZoneInfo('America/Sao_Paulo'))=='America/Sao_Paulo'
assert Path('/data/exams/old').read_bytes()==b'fictitious preserved bytes'
Path('/data/exams/new').write_bytes(b'fictitious new bytes')
'''
        docker('run','--rm','-v',volume+':/data/exams','erp-dents-homolog-api','python','-c',program)
        print('OK: existing bytes preserved; symlinks skipped; unsafe paths refused; UID 10001 can read/write; no compiler/installer; timezone available')
    finally:
        info=json.loads(docker('volume','inspect',volume).stdout)[0]
        assert info['Name']==volume and info['Labels']['erp-dents-test']=='storage-init'
        docker('volume','rm',volume)


if __name__=='__main__': main()
