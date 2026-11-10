"""Record materialized authorized queries; caller owns authorization and commit."""
from uuid import uuid4

from sqlalchemy import text
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.exceptions import ForbiddenError, UnauthorizedError
from src.core.permissions import can_access, normalize_permissions


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


def authorize_prepared_download(session, *, actor_id, session_id, exam):
    """Recheck after scanning, commit metadata, then release locks before streaming."""
    users = SqlAlchemyUserRepository(session)
    with users.administration_lock():
        actor = users.get(actor_id)
        if actor is None or not actor.is_active or not users.session_active(session_id, actor_id):
            raise UnauthorizedError('Sessão encerrada. Entre novamente.')
        raw = session.scalar(text('SELECT permissions FROM role_permissions WHERE role=:role'),
                             {'role': actor.role.value})
        if not can_access(actor.role, normalize_permissions(actor.role, raw), 'exams', 'view'):
            raise ForbiddenError('Sem permissão para acessar exames.')
        session.execute(text('''INSERT INTO access_audit
            (id,actor_id,action,target_id,patient_id,record_ids,record_versions,returned_count)
            VALUES (:id,:actor,'exam.download_prepared',:exam,:patient,'{}','{}',0)'''),
            {'id':uuid4(), 'actor':actor.id, 'exam':exam.id, 'patient':exam.patient_id})
        session.commit()
