"""Create isolated test TLS using OpenSSL (included in Git for Windows)."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment', choices=('homolog', 'dev'), default='homolog')
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[1] / '.data/tls' / args.environment
    target.mkdir(parents=True, exist_ok=True)
    paths = [target / name for name in ('ca.crt', 'server.crt', 'server.key')]
    if all(path.is_file() for path in paths):
        print('Local TLS files preserved; certificate expiry still needs checking.')
        return
    if any(path.exists() for path in paths):
        raise SystemExit('Incomplete TLS material; inspect locally before replacing anything.')
    executable = shutil.which('openssl') or r'C:\Program Files\Git\usr\bin\openssl.exe'
    if not Path(executable).is_file(): raise SystemExit('OpenSSL required (Git for Windows includes it).')
    def run(*command):
        result = subprocess.run([executable, *map(str, command)], capture_output=True)
        if result.returncode: raise RuntimeError('TLS preparation failed; no existing certificates overwritten.')
    # Temporary directory belongs exclusively to this operation, inside ignored .data.
    with tempfile.TemporaryDirectory(dir=target) as temporary:
        temp = Path(temporary)
        run('req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '365',
            '-subj', '/CN=ERP Dents '+args.environment+' Local CA',
            '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
            '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
            '-keyout', temp/'ca.key', '-out', temp/'ca.crt')
        run('req', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-subj', '/CN=localhost',
            '-keyout', temp/'server.key', '-out', temp/'server.csr')
        (temp/'extensions.cnf').write_text('basicConstraints=critical,CA:FALSE\n'
            'keyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n'
            'subjectAltName=DNS:localhost,IP:127.0.0.1\n', encoding='ascii')
        run('x509', '-req', '-in', temp/'server.csr', '-CA', temp/'ca.crt', '-CAkey', temp/'ca.key',
            '-CAcreateserial', '-days', '90', '-sha256', '-extfile', temp/'extensions.cnf', '-out', temp/'server.crt')
        run('verify', '-CAfile', temp/'ca.crt', temp/'server.crt')
        for path in paths: path.write_bytes((temp/path.name).read_bytes())
    # CA private key is not persisted; it cannot sign additional hosts.
    print('Isolated TLS created (90 days); trust ca.crt only on test computers.')


if __name__ == '__main__': main()
