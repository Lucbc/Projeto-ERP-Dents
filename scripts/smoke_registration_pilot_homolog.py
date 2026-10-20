"""Reception pilot acceptance in a private schema and trusted Chrome session."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(*args):
    sql, schema = args[7:9]
    sql(f"INSERT INTO {schema}.patients (id, full_name, birth_date, cpf, active, created_at, updated_at) "
        "VALUES (gen_random_uuid(), 'Paciente Legado Formato Ficticio', '9999-12-31', 'DOC-LEGADO-123456789012', true, now(), now())")
    browser(*args, browser_script='smoke_registration_pilot_homolog.cjs')
    assert sql(f"SELECT count(*) FROM {schema}.patients WHERE full_name = 'Paciente Piloto Cadastro Ficticio' "
               "AND rg = 'Registro-Ficticio/123456789012345-x'") == '1'
    assert sql(f"SELECT count(*) FROM {schema}.patients WHERE full_name = 'Paciente Legado Formato Ficticio' "
               "AND rg IS NULL") == '1'
    args[6]('RG stored without truncation and explicit clearing persisted in private PostgreSQL schema')


if __name__ == '__main__':
    main(verify, 'last-registration-pilot.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
