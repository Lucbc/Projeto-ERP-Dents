"""Audit read grant through Chrome, against a private migrated API/schema."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='smoke_access_audit_permission_browser_homolog.cjs')
    sql, schema = args[7:9]
    assert sql(f"SELECT permissions->'access_audit'->>'view' FROM {schema}.role_permissions WHERE role='reception'") == 'false'
    assert int(sql(f"SELECT count(*) FROM {schema}.administrative_audit WHERE action='permissions.updated' AND target_role='reception'")) == 3
    args[6]('Chrome permission grant/preservation/revocation agrees with three durable SQL audit events')


if __name__ == '__main__':
    main(verify, 'last-access-audit-permission-browser.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
