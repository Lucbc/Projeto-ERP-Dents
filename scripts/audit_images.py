"""Local image inspection. Do not send images, environments or clinic files to a service."""
import argparse
from collections import Counter
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SCANNER = 'aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', default='.env.homolog')
    args = parser.parse_args()
    # Compose contains credentials: keep its resolved output only in memory.
    result = subprocess.run(['docker','compose','--project-name','erp-dents-homolog',
        '--env-file',args.env_file,'-f','docker-compose.homolog.yml','config','--format','json'],
        cwd=ROOT, capture_output=True, text=True)
    if result.returncode: raise SystemExit('Could not resolve homologation configuration')
    config = json.loads(result.stdout)
    output = ROOT/'.data/security'
    cache = ROOT/'.data/trivy-cache'
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    failed = False
    for service in ('api','web','gateway','edge','db','clamav'):
        image = config['services'][service].get('image', 'erp-dents-homolog-'+service)
        result = subprocess.run(['docker','run','--rm',
            '-v','/var/run/docker.sock:/var/run/docker.sock',
            '-v',cache.as_posix()+':/root/.cache/trivy',
            '-v',output.as_posix()+':/reports',SCANNER,'image','--quiet','--scanners','vuln',
            '--format','json','--output','/reports/image-'+service+'.json',image], cwd=ROOT)
        if result.returncode:
            failed = True
            print(service+': scanner unavailable (not a clean result)')
            continue
        report = json.loads((output/('image-'+service+'.json')).read_text())
        findings = [v for r in report.get('Results', []) for v in r.get('Vulnerabilities', [])]
        counts = Counter(v['Severity'] for v in findings)
        failed |= any(v['Severity'] in ('HIGH','CRITICAL') for v in findings)
        print(service+': '+json.dumps(dict(counts)))
    return int(failed)


if __name__ == '__main__': raise SystemExit(main())
