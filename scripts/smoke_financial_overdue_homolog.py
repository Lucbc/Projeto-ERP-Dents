"""Fixed financial clock only in a disposable API process, never the host clock."""
import os
from functools import partial
from uuid import uuid4

from smoke_bootstrap_homolog import main, docker
from smoke_financial_history_browser_homolog import verify as browser


# Test-only launch command, not shipped in the application or enabled by a product setting.
PROGRAM = '''
import subprocess, sys
from datetime import datetime
from pathlib import Path
from src.core.domain import clinic_clock
import uvicorn
subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], check=True)
class FinancialClock:
    @staticmethod
    def now(tz):
        return datetime.fromisoformat(Path('/tmp/financial-test-clock').read_text()).astimezone(tz)
Path('/tmp/financial-test-clock').write_text('2030-01-08T02:59:59+00:00')
clinic_clock.datetime = FinancialClock
uvicorn.run('src.main:app', host='0.0.0.0', port=8000, proxy_headers=False)
'''


def verify(request, email, password, token, container, ready, passed, sql, schema, *, zone):
    def expect(method, path, data=None, status=200):
        code, body = request(method, path, data, token=token)
        assert code == status, f'{method}: expected {status}, got {code}'
        return body

    for kind in ('income', 'expense'):
        for status in ('pending', 'paid', 'cancelled'):
            for day in (6, 7, 8):
                row = expect('POST', '/api/financial', dict(entry_type=kind,
                    status='pending' if status == 'paid' else status,
                    description=f'Fictitious {kind} {status} day {day}', amount_cents=12000,
                    due_date=f'2030-01-{day:02}'), 201)
                if status == 'paid':
                    expect('POST', '/api/financial/' + row['id'] + '/mark-paid',
                           {'version': row['version'], 'idempotency_key': str(uuid4())})

    def fingerprint():
        return [sql(f'SELECT md5(coalesce(string_agg(to_jsonb(t)::text, chr(10) ORDER BY to_jsonb(t)::text), \'\')) FROM "{schema}".{table} t')
                for table in ('financial_entries', 'financial_payments', 'financial_operations',
                              'financial_entry_references', 'financial_payment_references')]
    before = fingerprint()
    for instant, day in (('2030-01-08T02:59:59+00:00', 7), ('2030-01-08T03:00:00+00:00', 8)):
        docker('exec', container, 'python', '-c',
               "from pathlib import Path; Path('/tmp/financial-test-clock').write_text(" + repr(instant) + ')')
        rows = expect('GET', '/api/financial?limit=100')['items']
        assert len(rows) == 18
        for row in rows:
            assert row['is_overdue'] == (row['status'] == 'pending' and int(row['due_date'][-2:]) < day)
            assert expect('GET', '/api/financial/' + row['id'])['is_overdue'] == row['is_overdue']
        summary = expect('GET', '/api/financial/summary')
        assert summary['overdue_income_cents'] == (day - 6) * 12000
        assert summary['pending_income_cents'] == summary['pending_expense_cents'] == 36000
        assert summary['income_total_cents'] == summary['expense_total_cents'] == 72000
        assert summary['received_cents'] == summary['paid_expense_cents'] == 36000
        assert summary['balance_cents'] == 0 and summary['entries_count'] == 12
        if os.environ.get('OVERDUE_BROWSER') == '1':
            browser(request, email, password, token, container, ready, passed, sql, schema,
                    browser_script='smoke_financial_overdue_browser_homolog.cjs',
                    browser_input={'day': day, 'zone': zone})
        assert fingerprint() == before, 'Financial reads changed persisted data'
    passed('overdue list/detail/summary across clinical midnight, all statuses/types, unchanged financial tables: ' + zone)


if __name__ == '__main__':
    for zone in ('UTC', 'America/Sao_Paulo', 'Asia/Tokyo'):
        main(partial(verify, zone=zone), 'last-financial-overdue-' + zone.replace('/', '-') + '.json',
             extra_env={'TZ': zone, 'PGTZ': zone, 'PUBLIC_ORIGIN': 'https://localhost:18444'},
             versioned_user_fixtures=False, api_command=['python', '-c', PROGRAM])
