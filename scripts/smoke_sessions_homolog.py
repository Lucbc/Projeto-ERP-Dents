"""Real HTTP session tests using a disposable homologation API/schema."""
import secrets

from smoke_bootstrap_homolog import docker, main


def verify(request, email, password, first, container, ready, passed):
    def expect(method, path, payload=None, token=None, status=200):
        code, body = request(method, path, payload, token=token)
        assert code == status, f"{method} {path}: expected {status}, got {code}"
        return body

    def login(address, secret):
        return expect("POST", "/api/auth/login", {"email": address, "password": secret})["access_token"]

    second = login(email, password)
    assert first != second
    expect("POST", "/api/auth/logout", token=first)
    expect("POST", "/api/auth/logout", token=first)
    expect("GET", "/api/auth/me", token=first, status=401)
    expect("GET", "/api/auth/me", token=second)
    passed("HTTP logout is idempotent and preserves a separate login")

    user_password = secrets.token_urlsafe(18)
    user = expect("POST", "/api/users", {"name": "Fictitious Session User", "role": "reception",
        "email": "session.http@example.com", "password": user_password}, token=second, status=201)
    one, two = login(user["email"], user_password), login(user["email"], user_password)
    new_password = secrets.token_urlsafe(18)
    expect("POST", "/api/auth/change-password", {"current_password": "wrong-fictitious-password",
        "new_password": new_password}, token=one, status=400)
    expect("GET", "/api/auth/me", token=one)
    expect("POST", "/api/auth/change-password", {"current_password": user_password,
        "new_password": new_password}, token=one)
    for token in (one, two): expect("GET", "/api/auth/me", token=token, status=401)
    expect("POST", "/api/auth/login", {"email": user["email"], "password": user_password}, status=401)
    one = login(user["email"], new_password)
    passed("HTTP password change revokes all user sessions; rejected changes preserve them")

    reset_password = secrets.token_urlsafe(18)
    expect("POST", "/api/users/" + user["id"] + "/set-password",
        {"new_password": reset_password}, token=second)
    expect("GET", "/api/auth/me", token=one, status=401)
    one = login(user["email"], reset_password)
    passed("HTTP administrative password reset revokes old sessions")

    for active in (False, True):
        expect("PUT", "/api/users/" + user["id"], {"is_active": active}, token=second)
        expect("GET", "/api/auth/me", token=one, status=401)
    two = login(user["email"], reset_password)
    docker("restart", container)
    ready()
    expect("GET", "/api/auth/me", token=first, status=401)
    expect("GET", "/api/auth/me", token=one, status=401)
    expect("GET", "/api/auth/me", token=second)
    expect("GET", "/api/auth/me", token=two)
    passed("deactivation/reactivation and API restart never restore revoked sessions")

    expect("PUT", "/api/users/" + user["id"], {"role": "coordinator"}, token=second)
    expect("GET", "/api/auth/me", token=two, status=401)
    one = login(user["email"], reset_password)
    expect("DELETE", "/api/users/" + user["id"], token=second, status=204)
    expect("GET", "/api/auth/me", token=one, status=401)
    passed("role changes and user deletion revoke access without affecting another user")


if __name__ == "__main__":
    main(session_checks=verify)
