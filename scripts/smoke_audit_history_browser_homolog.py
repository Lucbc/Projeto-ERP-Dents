"""History UI acceptance with synthetic events in a private homologation schema."""
from uuid import uuid4
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    request, _, _, token, _, _, passed, sql, schema = args
    status, actor = request('GET', '/api/auth/me', token=token)
    assert status == 200
    target = str(uuid4())
    # Synthetic historical metadata, not a claim of authenticated historical writes.
    sql(f"""INSERT INTO {schema}.administrative_audit
        (id,occurred_at,actor_id,action,target_user_id,before_version,after_version,changed_fields)
        SELECT gen_random_uuid(), '2026-01-15T12:00:00Z'::timestamptz + n * interval '1 minute',
        '{actor['id']}'::uuid,'user.updated','{target}'::uuid,1,2,ARRAY['name'] FROM generate_series(1,32) n""")
    def snapshot():
        return sql(f"SELECT md5(string_agg(to_jsonb(a)::text,'' ORDER BY id)) FROM {schema}.administrative_audit a WHERE target_user_id='{target}'")
    before = snapshot()
    browser(*args, browser_script='smoke_audit_history_browser_homolog.cjs', browser_input={'target': target})
    assert snapshot() == before
    assert sql(f"SELECT count(*) FROM {schema}.administrative_audit WHERE action='permissions.updated'") == '2'
    passed('History Chrome/API: pagination, filters, network error, denied/granted/revoked reader; SQL preserves 32 synthetic events and records two grant changes')


if __name__ == '__main__':
    main(verify, 'last-audit-history-browser.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
