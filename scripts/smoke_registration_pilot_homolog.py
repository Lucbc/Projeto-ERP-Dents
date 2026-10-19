"""Reception pilot acceptance in a private schema and trusted Chrome session."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    sql, schema = args[7:9]
    sql(f"INSERT INTO {schema}.patients (id, full_name, birth_date, cpf, active, created_at, updated_at) "
        "VALUES (gen_random_uuid(), 'Paciente Legado Formato Ficticio', '9999-12-31', 'DOC-LEGADO-123456789012', true, now(), now())")
    browser(*args, browser_script='smoke_registration_pilot_homolog.cjs')


if __name__ == '__main__':
    main(verify, 'last-registration-pilot.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
