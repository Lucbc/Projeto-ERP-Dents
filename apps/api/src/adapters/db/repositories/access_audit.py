"""Record materialized authorized queries; caller owns authorization and commit."""
from uuid import uuid4

from sqlalchemy import text


def record_clinical_access(session, *, actor_id, action, target_id, patient_id, records,
                           limit=None, offset=None):
    session.execute(text('''INSERT INTO access_audit
        (id,actor_id,action,target_id,patient_id,record_ids,record_versions,returned_count,page_limit,page_offset)
        VALUES (:id,:actor,:action,:target,:patient,CAST(:ids AS uuid[]),CAST(:versions AS bigint[]),
                :count,:limit,:offset)'''), {
        'id': uuid4(), 'actor': actor_id, 'action': action, 'target': target_id, 'patient': patient_id,
        'ids': [record.id for record in records], 'versions': [record.version for record in records],
        'count': len(records), 'limit': limit, 'offset': offset,
    })
