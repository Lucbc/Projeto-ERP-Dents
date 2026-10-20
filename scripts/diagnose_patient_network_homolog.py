"""Diagnostic of v0.1.10 network failures; assertions describe existing defects."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='diagnose_patient_network_homolog.cjs')
    sql, schema = args[7:9]
    assert sql(f"SELECT count(*) FROM {schema}.patients "
               "WHERE full_name = 'Network Lost Response Fictitious'") == '2'
    assert sql(f"SELECT count(*) FROM {schema}.patients "
               "WHERE full_name = 'Network Offline Fictitious'") == '1'
    assert sql(f"SELECT count(*) FROM {schema}.patients "
               "WHERE full_name = 'Network Lost Response Fictitious' "
               "AND notes = 'Fictitious edit response lost' AND version = 2") == '1'
    args[6]('Diagnostic SQL confirms duplicate after lost response and queued offline creation')


if __name__ == '__main__':
    main(verify, 'last-patient-network-diagnosis.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
