"""Read the explicit current version when arranging unrelated HTTP fixtures.

Version conflict tests must send their captured version directly, not use this helper.
"""
def with_permission_version(get, path, payload):
    role = path.rsplit('/', 1)[-1]
    current = next(item for item in get('/api/permissions')['items'] if item['role'] == role)
    return {**payload, 'version': current['version']}
