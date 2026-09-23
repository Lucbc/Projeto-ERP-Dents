"""Smoke test integrado, exclusivo do Docker erp-dents-homolog.

Usa somente biblioteca padrao. Nao imprime credenciais. O administrador de teste
fica em .data/homolog/admin.json (ignorado pelo Git). Demais registros sao
removidos ao final, salvo quando --keep-fixtures e informado para inspecao visual.
"""
from __future__ import annotations

import argparse
import base64
import json
import secrets
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
API = 'http://127.0.0.1:18000'
WEB = 'http://127.0.0.1:18080'
STATE = ROOT / '.data' / 'homolog'


def verify_target() -> None:
    result = subprocess.run(
        ['docker', 'inspect', 'erp-dents-homolog-api-1'],
        check=True, capture_output=True, text=True,
    )
    container = json.loads(result.stdout)[0]
    if container['Config']['Labels'].get('com.docker.compose.project') != 'erp-dents-homolog':
        raise RuntimeError('Alvo Docker nao pertence a homologacao.')
    if container['HostConfig'].get('PortBindings'):
        raise RuntimeError('API nao deve expor portas fora do gateway.')
    if not container['State']['Running']:
        raise RuntimeError('API de homologacao nao esta em execucao.')
    result = subprocess.run(['docker', 'inspect', 'erp-dents-homolog-gateway-1'],
                            check=True, capture_output=True, text=True)
    gateway = json.loads(result.stdout)[0]
    bindings = gateway['NetworkSettings']['Ports'].get('8000/tcp') or []
    if (gateway['Config']['Labels'].get('com.docker.compose.project') != 'erp-dents-homolog'
            or not gateway['State']['Running']
            or {'HostIp': '127.0.0.1', 'HostPort': '18000'} not in bindings):
        raise RuntimeError('Gateway nao corresponde ao ambiente/porta de homologacao.')


def request(method: str, path: str, payload=None, *, token=None, expected=200,
            raw=False, content_type='application/json', extra_headers=None):
    from cookie_client import CookieClient
    headers = {'Content-Type': content_type, **(extra_headers or {})}
    status, data, _ = CookieClient(API).request(method, path, payload, token, headers)
    if status != expected:
        raise AssertionError(f'{method} {path}: esperado {expected}, recebido {status}')
    return data if raw or data else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keep-fixtures', action='store_true')
    args = parser.parse_args()
    verify_target()
    STATE.mkdir(parents=True, exist_ok=True)
    checks: list[str] = []
    cleanup: list[str] = []
    fixtures: dict[str, str] = {}

    def passed(name: str) -> None:
        checks.append(name)
        print('OK:', name)

    credentials_path = STATE / 'admin.json'
    bootstrap = request('GET', '/api/auth/needs-bootstrap')['needsBootstrap']
    if bootstrap:
        env = dict(line.split('=', 1) for line in (ROOT / '.env.homolog').read_text().splitlines()
                   if '=' in line and not line.startswith('#'))
        activation = env.get('HOMOLOG_BOOTSTRAP_TOKEN', '')
        if not activation:
            raise RuntimeError('Gere o codigo local com scripts/homolog.ps1 -Action up.')
        if credentials_path.exists():
            credentials = json.loads(credentials_path.read_text())
        else:
            credentials = {'email': 'admin.homolog@example.com', 'password': secrets.token_urlsafe(18)}
            credentials_path.write_text(json.dumps(credentials, indent=2), encoding='utf8')
        request('POST', '/api/auth/bootstrap-admin', {
            'name': 'Administrador Homologacao', **credentials,
        }, extra_headers={'X-Bootstrap-Token': activation})
        passed('primeiro administrador criado em banco vazio')
    elif credentials_path.exists():
        credentials = json.loads(credentials_path.read_text())
    else:
        raise RuntimeError('Banco ja inicializado sem credenciais locais. Nao resetar automaticamente.')

    login = request('POST', '/api/auth/login', credentials)
    token = login['session']
    assert request('GET', '/api/auth/me', token=token)['id'] == login['user']['id']
    passed('login e identidade do administrador')
    request('GET', '/api/patients', expected=401)
    request('POST', '/api/auth/bootstrap-admin', {'name': 'Duplicado', **credentials}, expected=409)
    passed('acesso anonimo negado e segundo bootstrap bloqueado')
    with urlopen(WEB + '/patients', timeout=20) as response:
        assert response.status == 200 and b'id="root"' in response.read()
    passed('frontend e fallback de rota SPA')

    suffix = secrets.token_hex(4)

    def create(resource: str, payload: dict):
        item = request('POST', '/api/' + resource, payload, token=token, expected=201)
        cleanup.append('/api/' + resource + '/' + item['id'])
        fixtures[resource] = item['id']
        return item

    try:
        specialty = create('specialties', {'name': 'Homologacao ' + suffix})
        dentist = create('dentists', {
            'full_name': 'Dentista Ficticio ' + suffix, 'specialty': specialty['name'],
            'availability': [
                {'day_of_week': day, 'start_time': '08:00', 'end_time': '18:00'}
                for day in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            ],
        })
        procedure = create('procedures', {'name': 'Procedimento Teste ' + suffix,
                                          'price_cents': 15000, 'duration_minutes': 30})
        patient = create('patients', {'full_name': 'Paciente Ficticio ' + suffix,
                                      'birth_date': '1990-01-15', 'notes': 'Somente homologacao'})
        updated = request('PUT', '/api/patients/' + patient['id'],
                          {'preferred_name': 'Teste', 'version': patient['version']}, token=token)
        assert updated['preferred_name'] == 'Teste'
        passed('cadastros de especialidade, dentista, procedimento e paciente; edicao')

        start = (datetime.now(timezone(timedelta(hours=-3))) + timedelta(days=7)).replace(
            hour=10, minute=0, second=0, microsecond=0)
        payload = {'patient_id': patient['id'], 'dentist_id': dentist['id'],
                   'procedure_ids': [procedure['id']], 'start_at': start.isoformat(),
                   'end_at': (start + timedelta(minutes=30)).isoformat()}
        appointment = create('appointments', payload)
        request('POST', '/api/appointments', payload, token=token, expected=409)
        detail = request('GET', '/api/appointments/' + appointment['id'], token=token)
        assert detail['procedure_ids'] == [procedure['id']]
        passed('agendamento com procedimento e rejeicao de conflito sequencial')

        reception_password = secrets.token_urlsafe(18)
        reception = create('users', {'name': 'Recepcao Teste', 'email': f'recepcao.{suffix}@example.com',
                                     'password': reception_password, 'role': 'reception'})
        reception_token = request('POST', '/api/auth/login',
                                  {'email': reception['email'], 'password': reception_password})['session']
        request('GET', '/api/users', token=reception_token, expected=403)
        request('GET', '/api/patients', token=reception_token)
        passed('perfil recepcao le pacientes e nao administra usuarios')

        permissions = request('GET', '/api/permissions', token=token)
        assert len(permissions['items']) == 4
        next_visit = request('GET', '/api/consultations/next?dentist_id=' + dentist['id'], token=token)
        assert next_visit['id'] == appointment['id']
        passed('matriz de permissoes e proxima consulta')

        entry = request('POST', '/api/financial/from-appointment/' + appointment['id'], {},
                        token=token, expected=201)
        cleanup.append('/api/financial/' + entry['id'])
        fixtures['financial'] = entry['id']
        assert entry['total_cents'] == 15000
        request('POST', '/api/financial/from-appointment/' + appointment['id'], {},
                token=token, expected=409)
        summary = request('GET', '/api/financial/summary', token=token)
        assert summary['pending_income_cents'] >= 15000
        passed('cobranca, duplicidade sequencial e resumo; baixa historica testada em schema descartavel')

        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=')
        boundary = 'homolog-' + suffix
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="teste.png"\r\n'
                'Content-Type: image/png\r\n\r\n').encode() + png + f'\r\n--{boundary}--\r\n'.encode()
        exam = request('POST', '/api/patients/' + patient['id'] + '/exams', body, token=token,
                       expected=201, content_type='multipart/form-data; boundary=' + boundary)
        cleanup.append('/api/exams/' + exam['id'])
        fixtures['exams'] = exam['id']
        assert request('GET', '/api/exams/' + exam['id'] + '/download', token=token, raw=True) == png
        assert any(item['id'] == exam['id'] for item in request(
            'GET', '/api/patients/' + patient['id'] + '/exams', token=token))
        passed('upload, listagem e download integro de exame PNG')

        if args.keep_fixtures:
            (STATE / 'last-fixtures.json').write_text(json.dumps(fixtures, indent=2), encoding='utf8')
    finally:
        if not args.keep_fixtures:
            errors = []
            for path in reversed(cleanup):
                try:
                    if path.startswith(('/api/financial/', '/api/procedures/', '/api/specialties/')):
                        current = request('GET', path, token=token)
                        path += '?version=' + str(current['version'])
                    request('DELETE', path, token=token, expected=204)
                except Exception:
                    errors.append(path)
            if errors:
                raise RuntimeError('Limpeza incompleta dos registros ficticios: ' + ', '.join(errors))
            passed('limpeza dos registros ficticios preservando administrador e volumes')

    report = {'timestamp': datetime.now(timezone.utc).isoformat(), 'project': 'erp-dents-homolog',
              'checks': checks, 'kept_fixtures': args.keep_fixtures,
              'limits': 'Smoke API/banco/arquivos e resposta HTML. Nao valida UI, carga ou concorrencia.'}
    (STATE / 'last-smoke.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print(f'Concluido: {len(checks)} verificacoes. Credenciais locais: .data/homolog/admin.json')


if __name__ == '__main__':
    main()
