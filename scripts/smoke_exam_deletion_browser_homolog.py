"""Individual exams in the disposable trusted HTTPS browser harness."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as verify_browser

def verify(*args):
    verify_browser(*args, browser_script='smoke_exam_deletion_browser_homolog.cjs')

if __name__ == '__main__':
    main(verify, 'last-exam-deletion-browser.json', extra_env={
        'PUBLIC_ORIGIN':'https://localhost:18444', 'CLAMAV_HOST':'clamav'})
