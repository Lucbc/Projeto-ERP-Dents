"""Financial pagination and stable tied ordering, fictional private schema only."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser


def verify(request, email, password, token, container, ready, passed, sql, schema):
    def call(method, path, data=None, status=200):
        code, body = request(method, path, data, token=token)
        assert code == status, f'Pagination fixture expected {status}, received {code}'
        return body
    entry = call('POST', '/api/financial', {'entry_type': 'income', 'description': 'Fictitious Pagination Seed',
        'amount_cents': 1000, 'due_date': '2030-01-07'}, 201)
    # Explicit SQL volume fixture: identical dates force the UUID tie breaker.
    sql(f"""SET search_path TO {schema}; INSERT INTO {schema}.financial_entries
        SELECT (jsonb_populate_record(NULL::{schema}.financial_entries, to_jsonb(f) ||
            jsonb_build_object('id',md5('financial-page'||n)::uuid,
                'description','Fictitious Pagination '||lpad(n::text,3,'0')))).*
        FROM {schema}.financial_entries f CROSS JOIN generate_series(1,204) n WHERE f.id='{entry['id']}'""")
    expected = sql(f'SELECT id FROM {schema}.financial_entries ORDER BY id DESC').splitlines()
    pages = [call('GET', f'/api/financial?limit=200&offset={offset}') for offset in (0, 200)]
    assert [row['id'] for page in pages for row in page['items']] == expected
    assert all(page['total'] == 205 for page in pages)
    assert [len(page['items']) for page in pages] == [200, 5]
    assert call('GET', '/api/financial?limit=200&offset=400') == {'items': [], 'total': 205}
    reader = 'pagination-reader@example.com'
    call('POST', '/api/users', {'name': 'Fictitious Pagination Reader', 'email': reader,
        'password': password, 'role': 'reception'}, 201)
    grant = next(p for p in call('GET', '/api/permissions')['items'] if p['role'] == 'reception')
    grant['permissions']['financial'] = dict(view=True, create=False, update=False, delete=False)
    call('PUT', '/api/permissions/reception', grant)
    passed('API/SQL: 205 tied rows paginate as 200+5 with deterministic UUID order, no duplicate/omission')
    browser(request, email, password, token, container, ready, passed, sql, schema,
        browser_script='smoke_financial_pagination_browser_homolog.cjs',
        browser_input={'readerEmail': reader, 'lastRows': pages[1]['items']})
    assert sql(f'SELECT count(*) FROM {schema}.financial_entries') == '200'
    assert sql(f'SELECT count(*) FROM {schema}.financial_payments') == '0'
    assert sql(f'SELECT count(*) FROM {schema}.financial_entries WHERE version<>1') == '0'
    assert sql(f'SELECT count(*) FROM {schema}.financial_entries WHERE amount_cents<>1000 OR total_cents<>1000') == '0'
    passed('SQL: only five explicit fixture deletions; remaining amounts/versions untouched, no payments')


if __name__ == '__main__':
    main(verify, 'last-financial-pagination-browser.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
