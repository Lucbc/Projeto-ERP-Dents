"""Short-lived sessions and fictitious drafts, exclusively in private homologation."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='smoke_patient_session_expiry_homolog.cjs')
    sql, schema = args[7:9]
    assert sql(f'SELECT count(*) FROM {schema}.patients') == '0'
    assert sql(f'SELECT count(*) FROM {schema}.patient_creation_operations') == '0'
    args[6]('Expired session and unsaved draft created no patient or receipt in private PostgreSQL')


if __name__ == '__main__':
    main(verify, 'last-patient-session-expiry.json',
         extra_env={'PUBLIC_ORIGIN':'https://localhost:18444', 'JWT_EXPIRE_MINUTES':'1'},
         versioned_user_fixtures=False)
