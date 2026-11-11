"""Exams HTTP regression in a disposable schema/API/filesystem."""
import base64
import json
import secrets
from smoke_bootstrap_homolog import docker, main

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=")


def verify(request, email, password, admin, container, ready, passed, sql, schema):
    def events():
        return json.loads(sql(f'''SELECT coalesce(json_agg(a ORDER BY occurred_at,id),'[]'::json)::text
            FROM "{schema}".access_audit a'''))

    def expect(method, path, payload=None, token=admin, status=200, headers=None):
        if method == 'PUT' and path.startswith('/api/permissions/') and payload is not None and 'version' not in payload:
            from permission_fixture_homolog import with_permission_version
            payload = with_permission_version(lambda url: expect('GET', url), path, payload)
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
    download_path = "/api/exams/" + exam["id"] + "/download"
    etag = request.last_headers["ETag"]
    assert expect("GET", download_path, status=206, headers={"Range":"bytes=0-7", "If-Range":etag}) == PNG[:8]
    assert request.last_headers["Content-Range"] == f"bytes 0-7/{len(PNG)}"
    assert expect("GET", download_path, headers={"Range":"bytes=0-7", "If-Range":'"old"'}) == PNG
    multipart = expect("GET", download_path, status=206, headers={"Range":"bytes=0-7,20-29"})
    assert PNG[:8] in multipart and PNG[20:30] in multipart
    assert int(request.last_headers["Content-Length"]) == len(multipart)
    expect("GET", download_path, status=416, headers={"Range":"bytes=999999-"})
    recorded = events()
    actor = expect('GET','/api/auth/me')
    assert len(recorded) == 5  # Includes preparation followed by HTTP 416.
    for event in recorded:
        assert event['action'] == 'exam.download_prepared' and event['actor_id'] == actor['id']
        assert event['target_id'] == exam['id'] and event['patient_id'] == patient['id']
        assert event['record_ids'] == [] and event['record_versions'] == [] and event['returned_count'] == 0
    assert 'test.png' not in json.dumps(recorded) and password not in json.dumps(recorded)
    page = expect('GET','/api/access-audit?action=exam.download_prepared&target_id='+exam['id'])
    assert len(page['items']) == 5 and page['next_cursor'] is None
    assert {e['id'] for e in page['items']} == {e['id'] for e in recorded}
    assert all(e['record_ids']==[] and e['page_limit'] is None for e in page['items'])
    sql(f'''CREATE FUNCTION "{schema}".reject_download_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Fictitious failure' USING ERRCODE='23514'; END $$;
        CREATE TRIGGER reject_download_audit BEFORE INSERT ON "{schema}".access_audit
        FOR EACH ROW EXECUTE FUNCTION "{schema}".reject_download_audit()''')
    try:
        failure = expect('GET',download_path,status=422)
        assert isinstance(failure,dict) and 'Fictitious' not in json.dumps(failure)
        assert events() == recorded
    finally:
        sql(f'DROP TRIGGER reject_download_audit ON "{schema}".access_audit; DROP FUNCTION "{schema}".reject_download_audit()')
    passed("authenticated scanned downloads preserve Range, If-Range, multipart lengths and 416")
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
    assert events() == recorded
    pdf = upload(b"%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF", "sample.pdf", "application/pdf")
    upload(b"\xff\xd8\xff\xe0fictitious\xff\xd9", "sample.jpg", "image/jpeg")
    expect("DELETE", "/api/exams/" + pdf["id"], status=204)
    expect("DELETE", "/api/exams/" + pdf["id"], status=404)
    expect("GET", "/api/exams/" + pdf["id"] + "/download", status=404)
    assert events() == recorded
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
    assert len(events()) == len(recorded) + 1
    assert events()[:len(recorded)] == recorded
    assert sql(f'SELECT count(*) FROM "{schema}".exams') == "0"
    assert sql(f'SELECT count(*) FROM "{schema}".exam_file_deletions') == "0"
    result = docker("exec", container, "python", "-c",
        "from pathlib import Path; print(sum(p.is_file() for p in Path('/tmp/bootstrap-exams').rglob('*')))")
    assert result.stdout.strip() == "0"
    passed("exam and patient deletion remove metadata and physical files; cleanup queue is empty")
    passed('Prepared download audit preserves actor/targets without content, survives patient deletion and rejects audit failure before bytes')


if __name__ == "__main__":
    main(session_checks=verify, report_name="last-exams-smoke.json", extra_env={"EXAM_MAX_BYTES": "1024"})
