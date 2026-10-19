"""Historical CPF format diagnosis for v0.1.7, using private homolog resources."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='diagnose_cpf_format_homolog.cjs')
    passed, sql, schema = args[6:9]
    # Schema is created and owned by the private bootstrap harness.
    assert sql(f"SELECT count(*) FROM {schema}.patients WHERE cpf='123'") == '2'
    assert sql(f"SELECT count(*) FROM {schema}.patients WHERE cpf='123456789012'") == '1'
    assert sql(f"SELECT count(*) FROM {schema}.patients WHERE cpf='DOC-FICTICIO-123'") == '1'
    passed('private SQL confirms incomplete, mixed and long values persisted; no patient data logged')


if __name__ == '__main__':
    main(verify, 'last-cpf-format-diagnosis.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
