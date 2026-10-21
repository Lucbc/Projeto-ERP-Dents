"""Unsaved patient forms in private homologation; no real records."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='smoke_patient_unsaved_homolog.cjs')
    sql, schema = args[7:9]
    assert sql(f'SELECT count(*) FROM {schema}.patients') == '1'
    assert sql(f"SELECT count(*) FROM {schema}.patients WHERE notes = 'Fictitious saved note'") == '1'
    assert sql(f'SELECT count(*) FROM {schema}.patient_creation_operations') == '1'
    args[6]('Private PostgreSQL: only explicitly saved patient and receipt; discarded edit absent')


if __name__ == '__main__':
    main(verify, 'last-patient-unsaved.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
