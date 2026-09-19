"""Read-only bounded load and slow-body tests on the isolated local gateway."""
from concurrent.futures import ThreadPoolExecutor
import http.client
import json
import socket
import ssl
import time
from urllib.request import urlopen

import smoke_homolog as smoke


def tls_context():
    return ssl.create_default_context(cafile=str(smoke.ROOT/".data/tls/homolog/ca.crt"))


def health(_=None):
    start = time.monotonic()
    with urlopen('https://localhost:18443/health', timeout=5, context=tls_context()) as response:
        assert response.status == 200
    return time.monotonic() - start


def main():
    smoke.verify_target()
    with ThreadPoolExecutor(max_workers=8) as pool:
        times = sorted(pool.map(health, range(80)))
    connection = http.client.HTTPSConnection('localhost', 18443, timeout=5, context=tls_context())
    connection.putrequest('POST', '/api/patients/fictitious/exams')
    connection.putheader('Content-Length', str(1024 * 1024 * 1024 + 65537))
    connection.endheaders()
    response = connection.getresponse()
    assert response.status == 413
    response.read()
    connection.close()
    # Two connections with incomplete bodies hold both gateway/API upload slots.
    credentials = json.loads((smoke.STATE/"admin.json").read_text())
    session = smoke.request("POST", "/api/auth/login", credentials)["session"]
    auth_headers = {"Origin": "https://localhost:18443", "Cookie": session.cookies,
                    "X-Session-ID": session.session_id, "X-CSRF-Token": session.csrf_token}
    auth_wire = "".join(k+": "+v+"\r\n" for k,v in auth_headers.items()).encode()
    sockets = []
    try:
        for _ in range(2):
            stream = tls_context().wrap_socket(socket.create_connection(('127.0.0.1', 18443), timeout=5), server_hostname='localhost')
            stream.sendall(b'POST /api/patients/fictitious/exams HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\nContent-Type: application/octet-stream\r\n' + auth_wire + b'\r\nx')
            sockets.append(stream)
        # Poll only until the gateway has processed both initial headers.
        statuses = []
        for _ in range(10):
            conn = http.client.HTTPSConnection('localhost', 18443, timeout=5, context=tls_context())
            conn.request('POST', '/api/patients/fictitious/exams', body=b'x', headers=auth_headers)
            reply = conn.getresponse()
            statuses.append(reply.status)
            reply.read()
            conn.close()
            if reply.status == 503: break
            time.sleep(.1)
        assert statuses[-1] == 503
        assert health() < 5
        # Body deadline frees slots even when a client never completes the upload.
        sockets[0].settimeout(35)
        response = http.client.HTTPResponse(sockets[0])
        response.begin()  # A single recv is not guaranteed to contain a full status line.
        assert response.status == 408, f'Slow-body timeout: expected 408, got {response.status}'
    finally:
        for stream in sockets: stream.close()
        smoke.request("POST", "/api/auth/logout", token=session)
    assert health() < 5
    report = {'health_requests': len(times), 'workers': 8, 'p95_seconds': round(times[75], 4),
              'proxy_oversize': 413, 'parallel_upload_overload': 503, 'slow_body': 408}
    (smoke.STATE / 'last-exam-gateway-smoke.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print('OK: gateway bounds size/concurrency/time; health remains available; metrics:', json.dumps(report))


if __name__ == '__main__': main()
