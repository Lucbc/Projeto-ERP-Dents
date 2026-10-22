"""Diagnose lost initial-setup responses before any account exists."""
import os
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def run_case(fail_status, normal_creation=False):
    def setup(request, data, code, container, ready, passed, sql, schema):
        assert sql(f'SELECT count(*) FROM "{schema}".users') == '0'
        browser(request, data['email'], data['password'], None, container, ready, passed, sql, schema,
                browser_script='smoke_bootstrap_response_homolog.cjs',
                browser_input={'activationCode': code, 'failStatus': fail_status,
                               'normalCreation': normal_creation,
                               'acceptance': os.environ.get('BOOTSTRAP_RECOVERY_ACCEPTANCE') == '1'})
        assert sql(f'SELECT count(*) FROM "{schema}".users') == '1'
        assert sql(f'SELECT count(*) FROM "{schema}".patients') == '0'
        assert sql(f'SELECT count(*) FROM "{schema}".auth_sessions') == '1'
        passed('Private SQL: exactly one initial user, one login session, zero patients')
        return data

    main(report_name='last-bootstrap-response-' + ('normal' if normal_creation else 'status-failed' if fail_status else 'status-ok') + '.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False,
         setup_checks=setup)


if __name__ == '__main__':
    for fail_status in (False, True):
        run_case(fail_status)
    if os.environ.get('BOOTSTRAP_RECOVERY_ACCEPTANCE') == '1':
        run_case(False, normal_creation=True)
