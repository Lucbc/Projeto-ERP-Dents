"""Two real Chrome drafts against a private API/schema over trusted TLS."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='smoke_permission_version_browser_homolog.cjs')
    passed, sql, schema = args[6:9]
    assert sql(f'''SELECT permissions->'clinical_records'->>'view' FROM "{schema}".role_permissions WHERE role='admin' ''') == 'false'
    assert sql(f'''SELECT permissions->'clinical_records'->>'update' FROM "{schema}".role_permissions WHERE role='dentist' ''') == 'true'
    passed('SQL confirms clinical admin revocation and dentist update grant saved by Chrome')


if __name__ == '__main__':
    main(verify, 'last-permission-version-browser.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'})
