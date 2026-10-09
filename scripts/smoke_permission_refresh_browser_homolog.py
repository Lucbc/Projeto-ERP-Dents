"""Independent Chrome sessions against a private API/schema over trusted TLS."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='smoke_permission_refresh_browser_homolog.cjs')


if __name__ == '__main__':
    main(verify, 'last-permission-refresh-browser.json', extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'})
