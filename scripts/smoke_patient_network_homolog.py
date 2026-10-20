"""Acceptance of patient network recovery in private homologation resources."""
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as browser
from uuid import uuid4


def verify(*args):
    browser(*args, browser_script='smoke_patient_network_homolog.cjs')
    sql, schema = args[7:9]
    assert sql(f"SELECT count(*) FROM {schema}.patients "
               "WHERE full_name = 'Network Lost Response Fictitious'") == '1'
    assert sql(f"SELECT count(*) FROM {schema}.patients "
               "WHERE full_name = 'Network Offline Fictitious'") == '1'
    assert sql(f"SELECT count(*) FROM {schema}.patients "
               "WHERE full_name = 'Network Lost Response Fictitious' "
               "AND notes = 'Fictitious edit response lost' AND version = 2") == '1'
    assert sql(f"SELECT count(*) FROM {schema}.patient_creation_operations") == '3'
    args[6]('SQL confirms one creation per attempt, recovered edit and durable receipts')
    request, _, password, admin = args[:4]
    def call(method, path, payload=None, *, session=admin, key=None):
        return request(method, path, payload, token=session,
            extra_headers={'Idempotency-Key':str(key)} if key else None)
    matrix = next(item for item in call('GET','/api/permissions')[1]['items'] if item['role']=='reception')
    matrix['permissions']['patients'].update(view=True, create=True)
    assert call('PUT','/api/permissions/reception', {'version':matrix['version'],'permissions':matrix['permissions']})[0] == 200
    assert call('POST','/api/users', {'name':'Network Permissions Fictitious',
        'email':'network-permissions@example.com','password':password,'role':'reception'})[0] == 201
    status, identity = call('POST','/api/auth/login', {'email':'network-permissions@example.com','password':password})
    assert status == 200
    receiver, key = identity['session'], uuid4()
    payload = {'full_name':'Network Permissions Fictitious'}
    assert call('POST','/api/patients',payload,session=receiver,key=key)[0] == 201
    assert call('GET','/api/patients/creation-attempts/'+str(key),session=admin)[1]['recorded'] is False
    assert call('POST','/api/patients',{**payload,'notes':'Changed'},session=receiver,key=key)[0] == 409
    matrix = next(item for item in call('GET','/api/permissions')[1]['items'] if item['role']=='reception')
    matrix['permissions']['patients']['view'] = False
    assert call('PUT','/api/permissions/reception', {'version':matrix['version'],'permissions':matrix['permissions']})[0] == 200
    assert call('POST','/api/patients',payload,session=receiver,key=key)[0] == 403
    assert call('GET','/api/patients/creation-attempts/'+str(key),session=receiver)[0] == 403
    args[6]('HTTP replay checks current view permission, actor scope and payload mismatch')


if __name__ == '__main__':
    main(verify, 'last-patient-network-acceptance.json',
         extra_env={'PUBLIC_ORIGIN': 'https://localhost:18444'}, versioned_user_fixtures=False)
