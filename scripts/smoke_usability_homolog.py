"""Keyboard/search diagnosis with private fictional records only."""
import argparse
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    sql, schema = args[7:9]
    browser(*args, browser_script='smoke_usability_homolog.cjs', browser_input={'acceptance': ACCEPTANCE})
    assert sql(f'SELECT count(*) FROM "{schema}".patients') == '101'
    assert sql(f'SELECT count(*) FROM "{schema}".patients WHERE version<>1') == '0'
    args[6]('SQL: 101 fictional patients unchanged; invalid form and read-only search wrote nothing')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--acceptance', action='store_true')
    ACCEPTANCE = parser.parse_args().acceptance
    main(verify, 'last-usability.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
