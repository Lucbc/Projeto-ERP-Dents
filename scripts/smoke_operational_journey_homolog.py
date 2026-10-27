"""One fictional reception-to-payment journey in private homologation resources."""
from datetime import datetime, timedelta, timezone
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    sql, schema = args[7:9]
    day = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()
    browser(*args, browser_script='smoke_operational_journey_homolog.cjs', browser_input={'day': day})
    assert sql(f'''SELECT count(*) FROM "{schema}".patients p
        JOIN "{schema}".appointments a ON a.patient_id=p.id
        JOIN "{schema}".financial_entries f ON f.appointment_id=a.id AND f.patient_id=p.id
        JOIN "{schema}".financial_payments pay ON pay.entry_id=f.id
        WHERE p.full_name='Paciente Percurso Ficticio' AND p.birth_date='1990-01-15'
          AND p.version=1 AND a.version=1 AND f.version=2
          AND a.start_at=timestamptz '{day}T13:00:00Z'
          AND a.end_at=timestamptz '{day}T14:00:00Z'
          AND f.status='paid' AND f.amount_cents=12000 AND f.due_date=date '{day}'
          AND pay.amount_cents=12000''') == '1'
    assert sql(f'SELECT count(*) FROM "{schema}".financial_entries') == '1'
    assert sql(f'SELECT count(*) FROM "{schema}".financial_payments') == '1'
    args[6]('SQL: same fictional patient/appointment/charge/payment, clinical instants, versions, amount, due date and no duplicates')


if __name__ == '__main__':
    main(verify, 'last-operational-journey.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
