"""HTTP regression checks for delegated user administration, fictitious data only.

Default cleans its fixtures and restores coordinator permissions. --keep-fixtures
leaves them for UI inspection; finish with --cleanup. Never print credentials.
"""
import argparse
import json
import secrets
from datetime import datetime, timezone

import smoke_homolog as smoke

STATE_FILE = smoke.STATE / "admin-fixtures.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--keep-fixtures", action="store_true")
    group.add_argument("--cleanup", action="store_true")
    args = parser.parse_args()
    smoke.verify_target()
    credentials = json.loads((smoke.STATE / "admin.json").read_text(encoding="utf8"))
    login = smoke.request("POST", "/api/auth/login", credentials)
    admin_token = login["access_token"]

    def admin(method, path, data=None, expected=200):
        return smoke.request(method, path, data, token=admin_token, expected=expected)

    def save(state):
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf8")

    def clean(state):
        for path in list(reversed(state["cleanup"])):
            admin("DELETE", path, expected=204)
            state["cleanup"].remove(path)
            save(state)
        admin("PUT", "/api/permissions/coordinator", {"permissions": state["original_permissions"]})
        state["cleaned"] = True
        state.pop("delegate_credentials", None)
        save(state)
        print("OK: fixtures removed and original coordinator permissions restored")

    if STATE_FILE.exists():
        previous = json.loads(STATE_FILE.read_text(encoding="utf8"))
        if not previous.get("cleaned"):
            if args.cleanup:
                clean(previous)
                return
            raise RuntimeError("Previous fixtures pending; run --cleanup first")
    if args.cleanup:
        print("OK: no pending fixtures")
        return

    original = next(item["permissions"] for item in admin("GET", "/api/permissions")["items"]
                    if item["role"] == "coordinator")
    state = {"original_permissions": original, "cleanup": [], "cleaned": False}
    save(state)
    checks = []
    suffix = secrets.token_hex(4)

    def create(label, role):
        account = {"email": f"admin.test.{label}.{suffix}@example.com", "password": secrets.token_urlsafe(18)}
        user = admin("POST", "/api/users", {"name": "Homolog " + label, "role": role, **account}, 201)
        state["cleanup"].append("/api/users/" + user["id"])
        save(state)
        return user, account

    def passed(message):
        checks.append(message)
        print("OK:", message)

    try:
        delegate, account = create("delegate", "coordinator")
        target, _ = create("target-admin", "admin")
        ordinary, _ = create("ordinary", "reception")
        token = smoke.request("POST", "/api/auth/login", account)["access_token"]
        state["delegate_credentials"] = account
        save(state)
        smoke.request("GET", "/api/users", token=token, expected=403)
        passed("default coordinator cannot manage users")
        matrix = {**original, "users": {action: True for action in ("view", "create", "update", "delete")}}
        admin("PUT", "/api/permissions/coordinator", {"permissions": matrix})
        smoke.request("GET", "/api/users", token=token)
        passed("explicit delegation enables user listing")

        smoke.request("POST", "/api/users", {"name": "Blocked", "role": "admin",
                      "email": f"blocked.{suffix}@example.com", "password": secrets.token_urlsafe(18)},
                      token=token, expected=403)
        for user in (delegate, ordinary):
            smoke.request("PUT", "/api/users/" + user["id"], {"role": "admin"}, token=token, expected=403)
        passed("delegation cannot create admins or promote self/others")

        for payload in ({"name": "Blocked"}, {"role": "reception"}, {"is_active": False}):
            smoke.request("PUT", "/api/users/" + target["id"], payload, token=token, expected=403)
        smoke.request("POST", "/api/users/" + target["id"] + "/set-password",
                      {"new_password": secrets.token_urlsafe(18)}, token=token, expected=403)
        smoke.request("DELETE", "/api/users/" + target["id"], token=token, expected=403)
        passed("admin edits, demotion, deactivation, password reset and deletion blocked for delegate")

        edited = smoke.request("PUT", "/api/users/" + ordinary["id"], {"name": "Edited Fictitious"}, token=token)
        assert edited["name"] == "Edited Fictitious"
        password = secrets.token_urlsafe(18)
        smoke.request("POST", "/api/users/" + ordinary["id"] + "/set-password", {"new_password": password}, token=token)
        smoke.request("POST", "/api/auth/login", {"email": ordinary["email"], "password": password})
        passed("delegated edit/reset for non-admin works and new password logs in")
        smoke.request("DELETE", "/api/users/" + ordinary["id"], token=token, expected=204)
        state["cleanup"].remove("/api/users/" + ordinary["id"])
        save(state)
        passed("delegated deletion of non-admin works")
        assert admin("GET", "/api/users/" + target["id"])["role"] == "admin"
        assert admin("GET", "/api/auth/needs-bootstrap")["needsBootstrap"] is False
        passed("admin role intact and bootstrap remains closed")
        report = {"timestamp": datetime.now(timezone.utc).isoformat(), "checks": checks,
                  "project": "erp-dents-homolog", "kept_fixtures": args.keep_fixtures}
        (smoke.STATE / "last-admin-smoke.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    finally:
        if not args.keep_fixtures:
            clean(state)


if __name__ == "__main__":
    main()
