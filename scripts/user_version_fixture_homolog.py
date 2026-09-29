"""Arrange current versions for unrelated smoke fixtures, never production clients.

Version-contract smokes disable this helper and send captured versions themselves.
Denied/missing targets use a placeholder only to reach the authorization/not-found gate.
"""
import re


def prepare_user_fixture(method, path, payload, get):
    target = re.fullmatch(r'/api/users/([0-9a-f-]+)(/set-password)?', path)
    own = method == 'POST' and path == '/api/auth/change-password'
    mutation = target and (method == 'PUT' or method == 'DELETE' or (method == 'POST' and target[2]))
    if not (own or mutation): return path, payload
    if method != 'DELETE' and (not isinstance(payload, dict) or 'version' in payload): return path, payload
    current = get('/api/auth/me' if own else '/api/users/' + target[1])
    version = current.get('version', 1) if isinstance(current, dict) else 1
    if method == 'DELETE': return path + '?version=' + str(version), payload
    return path, {**payload, 'version': version}
