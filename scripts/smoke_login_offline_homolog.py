"""Offline login against isolated fictitious accounts; never print credentials."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    sql, schema = args[7:9]
    before = int(sql(f'SELECT count(*) FROM {schema}.auth_sessions'))
    browser(*args, browser_script='smoke_login_offline_homolog.cjs')
    assert int(sql(f'SELECT count(*) FROM {schema}.auth_sessions')) == before + 1
    assert sql(f'SELECT count(*) FROM {schema}.users') == '1'
    assert sql(f'SELECT count(*) FROM {schema}.patients') == '0'
    args[6]('Private SQL: exactly one additional session; original user retained; no patients')


if __name__ == '__main__':
    main(verify, 'last-login-offline.json', extra_env={'PUBLIC_ORIGIN':'https://localhost:18444'},
         versioned_user_fixtures=False)
