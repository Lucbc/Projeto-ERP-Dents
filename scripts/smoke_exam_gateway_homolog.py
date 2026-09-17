"""Read-only bounded load and slow-body tests on the isolated local gateway."""
from concurrent.futures import ThreadPoolExecutor
import http.client
import json
import socket
import time
from urllib.request import urlopen

import smoke_homolog as smoke


def health(_=None):
    start = time.monotonic()
    with urlopen('http://127.0.0.1:18000/health', timeout=5) as response:
        assert response.status == 200
    return time.monotonic() - start


def main():
    smoke.verify_target()
    with ThreadPoolExecutor(max_workers=8) as pool:
        times = sorted(pool.map(health, range(80)))
    connection = http.client.HTTPConnection('127.0.0.1', 18000, timeout=5)
    connection.putrequest('POST', '/api/patients/fictitious/exams')
    connection.putheader('Content-Length', str(1024 * 1024 * 1024 + 65537))
    connection.endheaders()
    response = connection.getresponse()
    assert response.status == 413
    response.read()
    connection.close()
    # Two connections with incomplete bodies hold both gateway/API upload slots.
    sockets = []
    try:
        for _ in range(2):
            stream = socket.create_connection(('127.0.0.1', 18000), timeout=5)
            stream.sendall(b'POST /api/patients/fictitious/exams HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\nContent-Type: application/octet-stream\r\n\r\nx')
            sockets.append(stream)
        # Poll only until the gateway has processed both initial headers.
        statuses = []
        for _ in range(10):
            conn = http.client.HTTPConnection('127.0.0.1', 18000, timeout=5)
            conn.request('POST', '/api/patients/fictitious/exams', body=b'x')
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
        result = sockets[0].recv(8192)
        assert b' 408 ' in result.split(b'\r\n', 1)[0]
    finally:
        for stream in sockets: stream.close()
    assert health() < 5
    report = {'health_requests': len(times), 'workers': 8, 'p95_seconds': round(times[75], 4),
              'proxy_oversize': 413, 'parallel_upload_overload': 503, 'slow_body': 408}
    (smoke.STATE / 'last-exam-gateway-smoke.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print('OK: gateway bounds size/concurrency/time; health remains available; metrics:', json.dumps(report))


if __name__ == '__main__': main()
