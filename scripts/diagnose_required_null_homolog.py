"""R21 residual diagnosis in disposable fictional homologation tables only."""
import json
from pathlib import Path
from smoke_bootstrap_homolog import main


def verify(request, email, password, token, container, ready, passed, sql, schema):
    results = []
    for resource, name_field, optional in (
        ('patients', 'full_name', 'notes'), ('dentists', 'full_name', 'phone'),
        ('procedures', 'name', 'description'), ('specialties', 'name', None),
    ):
        payload = {name_field: 'Fictitious Null Diagnosis', 'active': True}
        if optional:
            payload[optional] = 'Fictitious optional value'
        status, item = request('POST', '/api/' + resource, payload, token=token)
        assert status == 201, 'Could not create diagnosis fixture'
        url = '/api/' + resource + '/' + item['id']

        def snapshot():
            return sql(f'''SELECT row_to_json(t)::text FROM "{schema}".{resource} t
                           WHERE id='{item['id']}' ''')

        for field in (name_field, 'active'):
            before = snapshot()
            status, _ = request('PUT', url, {'version': item['version'], field: None}, token=token)
            unchanged = snapshot() == before
            print(f'DIAGNOSIS: {resource}.{field}=null HTTP {status}; SQL unchanged={unchanged}', flush=True)
            assert status == (400 if field == name_field else 422), 'Null rejection contract changed'
            assert unchanged, 'Rejected write changed fictional fixture'
            results.append({'resource': resource, 'field': field, 'input': 'null',
                            'status': status, 'sql_unchanged': unchanged})

        status, item = request('PUT', url, {'version': item['version']}, token=token)
        assert status == 200 and item[name_field] == payload[name_field] and item['active'] is True
        results.append({'resource': resource, 'input': 'omitted', 'status': status,
                        'required_values_preserved': True})
        if optional:
            status, item = request('PUT', url, {'version': item['version'], optional: None}, token=token)
            assert status == 200 and item[optional] is None
            stored = json.loads(snapshot())
            assert stored[optional] is None and stored['version'] == item['version']
            results.append({'resource': resource, 'field': optional, 'input': 'optional_null',
                            'status': status, 'sql_cleared': True})
    Path('.data/homolog/required-null-diagnosis.json').write_text(json.dumps(results, indent=2))
    passed('R21: rejected null writes left SQL unchanged; omission preserves required values and optional null clears fields; exact statuses saved locally')


if __name__ == '__main__':
    main(verify, 'last-required-null-diagnosis.json', versioned_user_fixtures=False)
