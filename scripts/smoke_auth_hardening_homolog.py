"""Authentication limits/compatibility over HTTP, with disposable data only."""
from concurrent.futures import ThreadPoolExecutor
import secrets

from smoke_bootstrap_homolog import docker, main


def verify(request, email, password, admin, container, ready, passed, sql, schema):
    def expect(method, path, payload=None, token=None, status=200, extra_headers=None):
        code, body = request(method, path, payload, token=token, extra_headers=extra_headers)
        assert code == status, f"{method} {path}: expected {status}, got {code}"
        return body

    secret = "a" * 72 + secrets.token_hex(12)
    user = expect("POST", "/api/users", {"name": "Fictitious Hardening User", "role": "reception",
        "email": "hardening@example.com", "password": secret}, token=admin, status=201)
    def login(password=secret, status=200, email=user["email"], headers=None):
        return expect("POST", "/api/auth/login", {"email": email, "password": password}, status=status,
                      extra_headers=headers)

    token = login()["session"]
    wrong = login("a" * 72 + "different-suffix", status=401)
    missing = login(status=401, email="missing@example.com")
    expect("PUT", "/api/users/" + user["id"], {"is_active": False}, token=admin)
    inactive = login(status=401)
    assert wrong == missing == inactive
    expect("PUT", "/api/users/" + user["id"], {"is_active": True}, token=admin)
    passed("long new passwords retain their suffix; authentication errors do not disclose account status")

    # Start a clean window only in this script's disposable schema.
    sql(f'DELETE FROM "{schema}".auth_attempts')
    def attempt(number):
        return request("POST", "/api/auth/login", {"email": user["email"].upper(), "password": "wrong"},
            extra_headers={"X-Forwarded-For": f"192.0.2.{number + 1}", "X-Real-IP": f"192.0.2.{number + 1}"})[0]
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(attempt, range(12)))
    assert results.count(401) == 10 and results.count(429) == 2
    login(status=429)
    assert 1 <= int(request.last_headers["Retry-After"]) <= 60
    docker("restart", container)
    ready()
    login(status=429)
    passed("ten concurrent attempts per normalized account; 429/Retry-After persist after API restart")

    sql(f'UPDATE "{schema}".auth_attempts SET expires_at = now() - interval \'1 second\'')
    token = login()["session"]
    passed("expired window restores access without changing credentials")

    # Fill the actual origin bucket near its limit without 120 expensive password hashes.
    sql(f'UPDATE "{schema}".auth_attempts SET attempts = 120')
    login(status=429, email="different-account@example.com", headers={"X-Forwarded-For": "198.51.100.1"})
    passed("origin limit also covers different accounts and ignores forged forwarding headers")
    sql(f'DELETE FROM "{schema}".auth_attempts')

    for _ in range(5):
        expect("POST", "/api/auth/change-password", {"current_password": "incorrect",
            "new_password": "valid-new-password"}, token=token, status=400)
    expect("POST", "/api/auth/change-password", {"current_password": secret,
        "new_password": "valid-new-password"}, token=token, status=429)
    expect("GET", "/api/auth/me", token=token)
    passed("password-change attempts are limited without revoking a valid session")

    sql(f'DELETE FROM "{schema}".auth_attempts')
    for _ in range(10):
        expect("POST", "/api/auth/bootstrap-admin", {"name": "Fictitious", "email": email,
            "password": password}, status=409)
    expect("POST", "/api/auth/bootstrap-admin", {"name": "Fictitious", "email": email,
        "password": password}, status=429)
    passed("initial activation endpoint also has an origin attempt limit")
    sql(f'DELETE FROM "{schema}".auth_attempts')


if __name__ == "__main__":
    main(session_checks=verify, report_name="last-auth-hardening-smoke.json")
