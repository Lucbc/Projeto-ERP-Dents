"""Read-only checks of the deployed ClamAV health policy in homologation."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import subprocess
from smoke_homolog import verify_target


def main():
    verify_target()
    container='erp-dents-homolog-clamav-1'
    script='/usr/local/bin/erp-clamav-health.sh'
    subprocess.run(['docker','exec',container,'sh',script],check=True,capture_output=True)
    cases=[('fresh',1,0),('stale',8,1),('future',-2,1)]
    for label,days,expected in cases:
        stamp=(datetime.now(timezone.utc)-timedelta(days=days)).strftime('%a %b %d %H:%M:%S %Y')
        code=f"clamdscan() {{ printf '%s\\n' 'ClamAV test/123/{stamp}'; }}\n. {script}\n"
        result=subprocess.run(['docker','exec','-i',container,'sh','-s'],input=code.encode(),capture_output=True)
        assert result.returncode==expected, f'ClamAV readiness: {label} classification failed'
    for code in ("clamdscan() { return 1; }", "clamdscan() { echo malformed; }"):
        result=subprocess.run(['docker','exec','-i',container,'sh','-s'],
            input=(code+'\n. '+script+'\n').encode(),capture_output=True)
        assert result.returncode!=0, 'ClamAV readiness accepted unavailable/malformed version'
    assert b'\r' not in (Path(__file__).resolve().parents[1]/'ops/clamav/healthcheck.sh').read_bytes()
    print('OK: loaded antivirus definitions are fresh; stale/future/unavailable/malformed checks fail closed; LF preserved.')


if __name__=='__main__': main()
