"""Exercise initial setup over HTTP in a disposable schema/API, never the main data.

Requires the current homologation image. Uses localhost:18001 temporarily; removes
its own container/schema/environment file in finally. No secrets are printed.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import re
import secrets
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

import smoke_homolog as smoke


def docker(*args, check=True):
    result = subprocess.run(["docker", *args], capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError("Docker test operation failed; inspect isolated test resources locally")
    return result


def main(session_checks=None):
    smoke.verify_target()
    db_info = json.loads(docker("inspect", "erp-dents-homolog-db-1").stdout)[0]
    db_env = dict(line.split("=", 1) for line in db_info["Config"]["Env"] if "=" in line)
    assert db_info["Config"]["Labels"]["com.docker.compose.project"] == "erp-dents-homolog"
    assert db_env["POSTGRES_DB"] == "erp_dents_homolog"
    api_info = json.loads(docker("inspect", "erp-dents-homolog-api-1").stdout)[0]
    original = dict(line.split("=", 1) for line in api_info["Config"]["Env"] if "=" in line)
    suffix = uuid4().hex
    schema = "test_bootstrap_http_" + suffix
    name = "erp-dents-homolog-bootstrap-" + suffix[:12]
    env_file = smoke.STATE / (name + ".env")
    code = secrets.token_hex(32)
    password = secrets.token_urlsafe(18)
    checks = []

    def sql(statement):
        return docker("exec", "erp-dents-homolog-db-1", "psql", "-U", "erp_homolog",
                      "-d", "erp_dents_homolog", "-v", "ON_ERROR_STOP=1", "-tAc", statement).stdout.strip()

    def request(method, path, payload=None, activation=None, token=None):
        headers = {"Content-Type": "application/json"}
        if activation is not None: headers["X-Bootstrap-Token"] = activation
        if token: headers["Authorization"] = "Bearer " + token
        req = Request("http://127.0.0.1:18001" + path, method=method, headers=headers,
                      data=json.dumps(payload).encode() if payload is not None else None)
        try: response = urlopen(req, timeout=10)
        except HTTPError as error: response = error
        with response:
            raw = response.read()
            data = json.loads(raw) if raw else None
            assert code not in json.dumps(data), "Activation code was exposed in response"
            return response.status, data

    def ready():
        for _ in range(40):
            try:
                status, body = request("GET", "/api/auth/needs-bootstrap")
                if status == 200: return body
            except (URLError, ConnectionError): pass
            time.sleep(0.25)
        raise RuntimeError("Isolated API did not become ready")

    def passed(message):
        checks.append(message)
        print("OK:", message)

    assert re.fullmatch(r"test_bootstrap_http_[0-9a-f]{32}", schema)
    sql(f'CREATE SCHEMA "{schema}"')
    try:
        env = {"DATABASE_URL": original["DATABASE_URL"], "JWT_SECRET_KEY": secrets.token_hex(32),
               "BOOTSTRAP_TOKEN": code, "PGOPTIONS": "-csearch_path=" + schema,
               "CORS_ORIGINS": "http://localhost:18081", "EXAMS_BASE_PATH": "/tmp/bootstrap-exams"}
        env_file.write_text("\n".join(key + "=" + value for key, value in env.items()) + "\n", encoding="utf8")
        docker("run", "-d", "--name", name, "--label", "com.docker.compose.project=erp-dents-homolog",
               "--network", "erp-dents-homolog_default", "--env-file", str(env_file),
               "-p", "127.0.0.1:18001:8000", "erp-dents-homolog-api")
        assert ready()["needsBootstrap"] is True
        passed("fresh API applies migrations and offers initial setup")
        data = {"name": "Fictitious Initial Admin", "email": "initial@example.com", "password": password}
        for activation in (None, "", "invalid-test-code"):
            assert request("POST", "/api/auth/bootstrap-admin", data, activation)[0] == 403
        assert request("GET", "/api/auth/needs-bootstrap")[1]["needsBootstrap"] is True
        passed("missing/empty/incorrect activation rejected without consuming setup")
        def register(number):
            payload = {**data, "email": f"initial{number}@example.com"}
            return request("POST", "/api/auth/bootstrap-admin", payload, code), payload
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(register, (1, 2)))
        assert sorted(result[0][0] for result in results) == [200, 409]
        winner = next(payload for (status, _), payload in results if status == 200)
        passed("concurrent HTTP registrations create exactly one administrator")
        status, login = request("POST", "/api/auth/login", {"email": winner["email"], "password": password})
        assert status == 200
        token = login["access_token"]
        assert request("GET", "/api/auth/me", token=token)[1]["role"] == "admin"
        assert request("GET", "/api/users", token=token)[1]["total"] == 1
        passed("initial account logs in with admin access and only one user exists")
        if session_checks:
            session_checks(request, winner["email"], password, token, name, ready, passed)
        for activation in (None, code):
            assert request("POST", "/api/auth/bootstrap-admin", data, activation)[0] == 409
        docker("restart", name)
        assert ready()["needsBootstrap"] is False
        passed("setup remains closed after repeated requests and API restart")
        sql(f'DELETE FROM "{schema}".users')
        assert request("GET", "/api/auth/needs-bootstrap")[1]["needsBootstrap"] is False
        assert request("POST", "/api/auth/bootstrap-admin", data, code)[0] == 409
        passed("direct deletion in disposable schema does not reopen initialization")
    finally:
        if docker("inspect", name, check=False).returncode == 0:
            docker("rm", "-f", name)
        sql(f'DROP SCHEMA "{schema}" CASCADE')
        env_file.unlink(missing_ok=True)
    passed("temporary API/schema/secrets removed; original data and volumes preserved")
    report = "last-session-smoke.json" if session_checks else "last-bootstrap-smoke.json"
    (smoke.STATE / report).write_text(json.dumps({
        "timestamp": datetime.now(timezone.utc).isoformat(), "checks": checks,
        "project": "erp-dents-homolog",
    }, indent=2), encoding="utf8")


if __name__ == "__main__": main()
