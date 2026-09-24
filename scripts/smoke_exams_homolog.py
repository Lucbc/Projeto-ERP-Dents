"""Exams HTTP regression in a disposable schema/API/filesystem."""
import base64
import json
import secrets
from smoke_bootstrap_homolog import docker, main

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=")


def verify(request, email, password, admin, container, ready, passed, sql, schema):
    def expect(method, path, payload=None, token=admin, status=200, headers=None):
        if method == 'DELETE' and path.startswith('/api/patients/') and '?' not in path:
            from patient_deletion_homolog import patient_deletion_path
            path = patient_deletion_path(lambda url: expect('GET', url), path)
        code, body = request(method, path, payload, token=token, extra_headers=headers)
        assert code == status, f"{method} {path}: expected {status}, got {code}"
        return body

    patient = expect("POST", "/api/patients", {"full_name": "Fictitious Exam Patient"}, status=201)
    path = "/api/patients/" + patient["id"] + "/exams"
    assert expect("GET", "/api/exams/upload-policy")["max_bytes"] == 1024
    def upload(data, name="test.png", mime="text/html", status=201, token=admin):
        boundary = "test-boundary-" + secrets.token_hex(8)
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                f'Content-Type: {mime}\r\n\r\n').encode() + data + f"\r\n--{boundary}--\r\n".encode()
        return expect("POST", path, body, token=token, status=status,
                      headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    exam = upload(PNG)
    assert exam["mime_type"] == "image/png"
    body = expect("GET", "/api/exams/" + exam["id"] + "/download")
    assert body == PNG
    assert request.last_headers["X-Content-Type-Options"] == "nosniff"
    assert request.last_headers["Content-Disposition"].startswith("attachment;")
    assert "sandbox" in request.last_headers["Content-Security-Policy"]
    passed("real multipart upload detects type and downloads exact bytes with attachment/nosniff/sandbox")
    for data, name in ((b"<script>alert(1)</script>", "fake.png"), (PNG, "active.html"),
                       (b"<svg/>", "active.svg"), (b"", "empty.png")):
        upload(data, name, status=400)
    upload(b"x" * 1025, status=413)
    upload(b"x" * 70000, status=413)
    assert len(expect("GET", path)) == 1
    passed("active/mismatched/empty files and excessive file/body sizes rejected without metadata")
    upload(PNG, token=None, status=403)  # Missing CSRF is rejected before authentication/body parsing.
    expect("GET", "/api/exams/" + exam["id"] + "/download", token=None, status=401)
    reception_secret = secrets.token_urlsafe(18)
    reception = expect("POST", "/api/users", {"name": "Fictitious Reception", "email": "exam.reception@example.com",
        "password": reception_secret, "role": "reception"}, status=201)
    token = expect("POST", "/api/auth/login", {"email": reception["email"], "password": reception_secret}, token=None)["session"]
    # Explicitly revoke exam access for this isolated role; test all routes.
    permissions = expect("GET", "/api/permissions")
    entry = next(item for item in permissions["items"] if item["role"] == "reception")
    if entry is not None:
        matrix = entry["permissions"]
        matrix["exams"] = {key: False for key in ("view", "create", "update", "delete")}
        expect("PUT", "/api/permissions/reception", {"permissions": matrix})
        expect("GET", path, token=token, status=403)
        upload(PNG, token=token, status=403)
        expect("GET", "/api/exams/" + exam["id"] + "/download", token=token, status=403)
        expect("DELETE", "/api/exams/" + exam["id"], token=token, status=403)
    else:
        raise AssertionError("Unexpected permissions response")
    passed("anonymous and unauthorized role cannot read/upload/download/delete exams")
    pdf = upload(b"%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF", "sample.pdf", "application/pdf")
    upload(b"\xff\xd8\xff\xe0fictitious\xff\xd9", "sample.jpg", "image/jpeg")
    expect("DELETE", "/api/exams/" + pdf["id"], status=204)
    expect("GET", "/api/exams/" + pdf["id"] + "/download", status=404)
    dentist = expect("POST", "/api/dentists", {"full_name": "Fictitious Exam Dentist",
        "availability": [{"day_of_week": "friday", "start_time": "08:00", "end_time": "18:00"}]}, status=201)
    appointment = expect("POST", "/api/appointments", {"patient_id": patient["id"], "dentist_id": dentist["id"],
        "start_at": "2027-01-15T10:00:00-03:00", "end_at": "2027-01-15T10:30:00-03:00"}, status=201)
    expect("DELETE", "/api/patients/" + patient["id"], status=409)
    assert expect("GET", "/api/exams/" + exam["id"] + "/download") == PNG
    assert sql(f'SELECT count(*) FROM "{schema}".exam_file_deletions') == "0"
    expect("DELETE", "/api/appointments/" + appointment["id"] + "?version=1", status=204)
    passed("patient with an appointment returns 409 and preserves exam metadata/files without cleanup intents")
    expect("DELETE", "/api/patients/" + patient["id"], status=204)
    assert sql(f'SELECT count(*) FROM "{schema}".exams') == "0"
    assert sql(f'SELECT count(*) FROM "{schema}".exam_file_deletions') == "0"
    result = docker("exec", container, "python", "-c",
        "from pathlib import Path; print(sum(p.is_file() for p in Path('/tmp/bootstrap-exams').rglob('*')))")
    assert result.stdout.strip() == "0"
    passed("exam and patient deletion remove metadata and physical files; cleanup queue is empty")


if __name__ == "__main__":
    main(session_checks=verify, report_name="last-exams-smoke.json", extra_env={"EXAM_MAX_BYTES": "1024"})
