"""Live user lists, secret cleanup and session revocation in isolated Chrome/TLS."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    browser(*args, browser_script='smoke_user_refresh_browser_homolog.cjs')


if __name__ == '__main__':
    main(verify, 'last-user-refresh-browser.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
