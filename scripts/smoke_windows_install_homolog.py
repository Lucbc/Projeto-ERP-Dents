"""Exercise Windows preparation and production Compose in isolated homolog resources.

No production container/volume is started. Service names, volumes and network are
rewritten to unique homolog-owned resources before Compose up. Secrets use stdin.
"""
import json
import secrets
import ssl
import subprocess
import time
from urllib.error import URLError
from uuid import uuid4
from cookie_client import CookieClient
from smoke_backup_restore_homolog import ROOT, PROJECT, run


def main(upgrade=False, update_module=None):
    identifier = 'install_' + uuid4().hex[:12]
    folder = ROOT / '.data' / identifier
    folder.mkdir()
    environment = folder / 'server.env'
    tls = folder / 'tls'
    origin = 'https://localhost:18445'
    created_names = []
    compose = ['docker', 'compose', '--project-directory', str(ROOT), '--project-name', PROJECT, '-f', '-']
    private_config = None
    try:
        release_images = None
        if upgrade:
            if update_module is None:
                import smoke_windows_update_homolog as update_module
            release_images = update_module.prepare_images(folder)
        run('powershell', '-NoProfile', '-File', str(ROOT / 'scripts/configure-server.ps1'),
            '-PublicOrigin', origin, '-EnvFile', str(environment))
        run('powershell', '-NoProfile', '-File', str(ROOT / 'scripts/configure-server-tls.ps1'),
            '-PublicOrigin', origin, '-OutputDirectory', str(tls))
        contents = environment.read_text()
        contents = contents.replace('TLS_DIRECTORY=./.data/tls/prod', 'TLS_DIRECTORY=' + tls.as_posix())
        environment.write_text(contents, encoding='utf-8')
        settings = dict(line.split('=', 1) for line in contents.splitlines() if '=' in line)
        config = json.loads(run('docker', 'compose', '--project-directory', str(ROOT), '--project-name', PROJECT,
                           '--env-file', str(environment), '-f', str(ROOT / 'docker-compose.yml'), 'config', '--format', 'json'))
        old_services = config['services']
        names = {name: identifier + '_' + name for name in old_services}
        volume_names = {name: identifier + '_' + name for name in config['volumes']}
        physical_volumes = {name: PROJECT + '_' + volume_names[name] for name in volume_names}
        network = PROJECT + '_' + identifier
        config['networks'] = {identifier: {'name': network}}
        config['volumes'] = {volume_names[name]: {'name': physical_volumes[name]} for name in volume_names}
        config['services'] = {}
        for name, service in old_services.items():
            source_service = 'api' if name == 'exam-storage-init' else name
            info = json.loads(run('docker', 'inspect', PROJECT + '-' + source_service + '-1'))[0]
            if info['Config']['Labels'].get('com.docker.compose.project') != PROJECT:
                raise RuntimeError('Unexpected source image project.')
            service['image'] = info['Image']
            if release_images and source_service in release_images['old']:
                service['image'] = release_images['old'][source_service]
            service.pop('build', None)
            service['pull_policy'] = 'never'
            service['container_name'] = PROJECT + '-' + names[name]
            created_names.append(service['container_name'])
            service['networks'] = {identifier: {'aliases': [name]}}
            if 'depends_on' in service:
                service['depends_on'] = {names[key]: value for key, value in service['depends_on'].items()}
            for mount in service.get('volumes', []):
                if mount['type'] == 'volume':
                    mount['source'] = volume_names[mount['source']]
            config['services'][names[name]] = service
        # Bind HTTPS only to loopback, never publish this test to the clinic LAN.
        config['services'][names['edge']]['ports'] = [{'target':443,'published':'18445','host_ip':'127.0.0.1','protocol':'tcp'}]
        private_config = json.dumps(config).encode()
        assert all(name.startswith(PROJECT + '-install_') for name in created_names)
        # Reuse ONLY virus signature bytes to avoid a second large download.
        # Database/exam volumes remain new and empty. Signature bootstrap itself
        # is covered by existing CI, not claimed as an offline-install test here.
        source_volume = PROJECT + '_clamav_data'
        label = json.loads(run('docker', 'volume', 'inspect', source_volume))[0]['Labels']
        assert label['com.docker.compose.project'] == PROJECT
        run('docker', 'volume', 'create', '--label', 'com.docker.compose.project=' + PROJECT,
            '--label', 'com.docker.compose.volume=' + volume_names['clamav_data'], physical_volumes['clamav_data'])
        api_image = config['services'][names['api']]['image']
        run('docker','run','--rm','--network','none','--user','0:0','--label','com.docker.compose.project='+PROJECT,
            '--mount',f'type=volume,src={source_volume},dst=/source,readonly',
            '--mount',f'type=volume,src={physical_volumes["clamav_data"]},dst=/target',api_image,
            'sh','-c','cp -a /source/. /target/')
        print('Prepared Windows configuration/TLS and isolated Compose; starting empty database/exam installation.', flush=True)
        run(*compose, 'up', '-d', '--no-build', input=private_config)
        client = CookieClient(origin, origin=origin, context=ssl.create_default_context(cafile=str(tls/'ca.crt')))
        def ready():
            for _ in range(120):
                try:
                    if client.request('GET','/health',timeout=3)[0] == 200: return
                except (URLError,ConnectionError): pass
                time.sleep(.5)
            raise RuntimeError('Fresh installation did not become healthy.')
        ready()
        token = None
        def request(method,path,data=None,expected=200,headers=None):
            status,body,_ = client.request(method,path,data,token,headers)
            if status != expected: raise RuntimeError(f'Fresh installation HTTP check failed: {status}')
            return body
        assert request('GET','/api/auth/needs-bootstrap')['needsBootstrap'] is True
        credentials = {'email':'fresh-install@example.com','password':secrets.token_urlsafe(24)}
        request('POST','/api/auth/bootstrap-admin',{'name':'Fictitious Install Admin',**credentials},
                headers={'X-Bootstrap-Token':settings['BOOTSTRAP_TOKEN']})
        token = request('POST','/api/auth/login',credentials)['session']
        patient = request('POST','/api/patients',{'full_name':'Fictitious Fresh Install Patient','birth_date':'1980-04-21'},201)
        patient = request('PUT','/api/patients/'+patient['id'],{'version':patient['version'],'notes':'Fictitious persisted update'})
        if upgrade:
            update_module.verify_update(folder, environment, tls, config, names, physical_volumes,
                          compose, release_images, client, request, ready, patient, settings, credentials)
            return
        # Repeating up must reuse the same database and preserve activation state.
        run(*compose, 'up', '-d', '--no-build', input=private_config)
        run(*compose, 'restart', names['api'], names['edge'], input=private_config)
        ready()
        assert request('GET','/api/auth/needs-bootstrap')['needsBootstrap'] is False
        token = request('POST','/api/auth/login',credentials)['session']
        restored = request('GET','/api/patients/'+patient['id'])
        assert restored['notes'] == patient['notes'] and restored['birth_date'] == '1980-04-21'
        assert client.raw('GET','/patients')[0] == 200
        print('PASS: generated Windows config/certificate, empty DB migration, bootstrap/login, patient create/edit, repeat up and restart preservation.',flush=True)
        (folder/'result.json').write_text(json.dumps({'passed':True,'project':PROJECT,'checks':['fresh config/TLS','migrations','bootstrap/login','patient create/edit','repeat up','restart'],'limits':['cached images/signatures','no physical Windows reboot','no second station']},indent=2))
    finally:
        # Never compose down: only this invocation's uniquely named containers.
        for name in reversed(created_names):
            if subprocess.run(['docker','inspect',name],capture_output=True).returncode == 0:
                run('docker','rm','-f',name)
        print('Private volumes/configuration retained; original homolog resources preserved.',flush=True)


if __name__ == '__main__': main()
