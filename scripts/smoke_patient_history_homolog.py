"""Acceptance of patient history navigation guard in private homologation."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='smoke_patient_history_homolog.cjs')
    sql, schema = args[7:9]
    assert sql(f'SELECT count(*) FROM {schema}.patients') == '1'
    assert sql(f"SELECT count(*) FROM {schema}.patients WHERE notes = 'Fictitious original note' AND version = 1") == '1'
    assert sql(f'SELECT count(*) FROM {schema}.patient_creation_operations') == '0'
    args[6]('Private SQL: only fixture patient, original note/version unchanged, no creation receipts')


if __name__ == '__main__':
    main(verify, 'last-patient-history.json',
         extra_env={'PUBLIC_ORIGIN':'https://localhost:18444'}, versioned_user_fixtures=False)
