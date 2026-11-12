"""History UI acceptance with synthetic events in a private homologation schema."""
from uuid import uuid4
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    request, _, _, token, _, _, passed, sql, schema = args
    status, actor = request('GET', '/api/auth/me', token=token)
    assert status == 200
    target, record, second_record, appointment, exam = [str(uuid4()) for _ in range(5)]
    # Declared SQL-only historical fixtures, not authenticated historical requests.
    sql(f"""INSERT INTO {schema}.access_audit
        (id,occurred_at,actor_id,action,target_id,patient_id,record_ids,record_versions,returned_count,page_limit,page_offset)
        SELECT gen_random_uuid(), '2026-01-15T12:00:00Z'::timestamptz + n * interval '1 minute',
        '{actor['id']}'::uuid,
        CASE n%4 WHEN 0 THEN 'exam.download_prepared' WHEN 1 THEN 'clinical.record_read'
                 WHEN 2 THEN 'clinical.appointment_read' ELSE 'clinical.patient_list' END,
        (CASE n%4 WHEN 0 THEN '{exam}' WHEN 1 THEN '{record}' WHEN 2 THEN '{appointment}' ELSE '{target}' END)::uuid,
        CASE WHEN n=2 THEN NULL ELSE '{target}'::uuid END,
        CASE n%4 WHEN 1 THEN ARRAY['{record}'::uuid] WHEN 3 THEN ARRAY['{record}'::uuid,'{second_record}'::uuid] ELSE ARRAY[]::uuid[] END,
        CASE n%4 WHEN 1 THEN ARRAY[n::bigint] WHEN 3 THEN ARRAY[n::bigint,n+1::bigint] ELSE ARRAY[]::bigint[] END,
        CASE n%4 WHEN 1 THEN 1 WHEN 3 THEN 2 ELSE 0 END,
        CASE WHEN n%4=3 THEN 20 ELSE NULL END, CASE WHEN n%4=3 THEN 0 ELSE NULL END
        FROM generate_series(1,32) n""")
    def snapshot():
        return sql(f"SELECT md5(string_agg(to_jsonb(a)::text,'' ORDER BY id)) FROM {schema}.access_audit a")
    before = snapshot()
    browser(*args, browser_script='smoke_access_audit_history_browser_homolog.cjs', browser_input={'target': target, 'exam': exam})
    assert snapshot() == before
    assert sql(f"SELECT count(*) FROM {schema}.administrative_audit WHERE action='permissions.updated'") == '2'
    passed('History Chrome/API: pagination, filters, network error, denied/granted/revoked reader; SQL preserves 32 synthetic events and records two grant changes')


if __name__ == '__main__':
    main(verify, 'last-access-audit-history-browser.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
