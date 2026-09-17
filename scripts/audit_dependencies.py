"""Audit package locks. Reports stay local and never include environment secrets."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='.data/security')
    args = parser.parse_args()
    output = (ROOT / args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    npm = shutil.which('npm')
    if not npm:
        raise SystemExit('npm is required')
    calls = [([npm, 'audit', '--prefix', str(ROOT/'apps/web'), '--json'], 'npm.json'),
             ([sys.executable, '-m', 'pip_audit', '--disable-pip', '--no-deps', '-r',
               str(ROOT/'apps/api/requirements.txt'), '-f', 'json'], 'python.json')]
    failed = False
    for command, filename in calls:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        if result.returncode not in (0, 1):
            print(filename + ': audit unavailable (not a clean result)')
            failed = True
            continue
        try:
            data = json.loads(result.stdout)
        except ValueError:
            print(filename + ': audit returned no valid report')
            failed = True
            continue
        (output/filename).write_text(json.dumps(data, indent=2), encoding='utf8')
        failed |= result.returncode != 0 or 'error' in data
        print(filename + ': ' + ('passed' if result.returncode == 0 and 'error' not in data else 'findings or service error; inspect report'))
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
