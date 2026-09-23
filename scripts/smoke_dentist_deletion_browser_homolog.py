"""Dentist deletion and account reassignment in the private TLS browser harness."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as verify_browser


def verify(*args):
    verify_browser(*args,browser_script='smoke_dentist_deletion_browser_homolog.cjs')


if __name__=='__main__':
    main(verify,'last-dentist-deletion-browser.json',extra_env={'PUBLIC_ORIGIN':'https://localhost:18444'})
