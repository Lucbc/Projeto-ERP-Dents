"""Update all six runtime images in a disposable installation, preserving data."""
import io
import tarfile
from smoke_backup_restore_homolog import PROJECT, run
from smoke_windows_update_homolog import verify_update


def prepare_images(folder):
    releases = {'old': 'piloto-cadastros-v0.1.16',
                'new': run('git', 'rev-parse', 'HEAD').decode().strip()}
    expected = {'apps/api/Dockerfile', 'apps/web/Dockerfile', 'ops/nginx/Dockerfile',
                'ops/postgres/Dockerfile', 'ops/clamav/Dockerfile'}
    changed = set(run('git', 'diff', '--name-only', releases['old'], releases['new'], '--',
                      'apps', 'ops', 'docker-compose.yml').decode().splitlines())
    if changed != expected:
        raise RuntimeError('Expected exactly the five reviewed runtime Dockerfiles; no application/schema changes.')
    images = {'releases': releases, 'runtime_only': True}
    for label, revision in releases.items():
        source = folder / label
        source.mkdir()
        with tarfile.open(fileobj=io.BytesIO(run('git', 'archive', revision))) as archive:
            archive.extractall(source, filter='data')
        images[label] = {}
        for service, path in {'api': 'apps/api', 'web': 'apps/web', 'gateway': 'ops/nginx',
                              'db': 'ops/postgres', 'clamav': 'ops/clamav'}.items():
            image = PROJECT + '-musl-' + folder.name + '-' + label + '-' + service
            print('Building isolated release image: ' + label + '/' + service, flush=True)
            run('docker', 'build', '-q', '-t', image, str(source / path))
            images[label][service] = run('docker', 'image', 'inspect', '--format', '{{.Id}}', image).decode().strip()
        images[label]['edge'] = images[label]['gateway']
    for service in images['old']:
        if images['old'][service] == images['new'][service]:
            raise RuntimeError('Expected a replaced runtime image for every service.')
    return images


if __name__ == '__main__':
    import sys
    from smoke_windows_install_homolog import main
    main(upgrade=True, update_module=sys.modules[__name__])
