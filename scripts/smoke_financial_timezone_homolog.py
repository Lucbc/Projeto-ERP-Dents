"""Clinical payment in a UTC workstation, including lost-response replay and SQL history."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    sql, schema = args[7:9]
    browser(*args, browser_input={'timezoneId': 'UTC', 'clinicalPayment': True})
    assert sql(f'''SELECT count(*) FROM "{schema}".financial_payments
                   WHERE paid_at=timestamptz '2020-01-08T01:30:00Z' ''') == '1'
    args[6]('SQL: one historical payment retains the clinical instant after replay/reversal/new payment')


if __name__ == '__main__':
    main(verify, 'last-financial-timezone-browser.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'})
