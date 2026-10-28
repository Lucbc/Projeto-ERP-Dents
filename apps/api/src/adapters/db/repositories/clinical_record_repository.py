"""Transactional clinical storage with current session and explicit grants."""
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from uuid import UUID, uuid4

from sqlalchemy import text as sql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.adapters.db.repositories.appointment_repository import SqlAlchemyAppointmentRepository
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.clinical_record import (
    ClinicalAddendum, ClinicalContext, ClinicalRecord, append_addendum, create_draft,
    finalize, require_clinical_permission, save_draft,
)
from src.core.domain.exceptions import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError


def _json(value):
    return json.dumps(value, default=str, sort_keys=True, ensure_ascii=False)


def _decode(value):
    data = dict(value)
    for field in ('id', 'appointment_id', 'patient_id', 'dentist_id', 'author_id'):
        data[field] = UUID(str(data[field]))
    for field in ('created_at', 'updated_at', 'finalized_at'):
        if data[field] is not None and not isinstance(data[field], datetime):
            data[field] = datetime.fromisoformat(data[field])
        if data[field] is not None:
            data[field] = data[field].astimezone(timezone.utc)
    data['context'] = ClinicalContext(**data['context']) if data['context'] is not None else None
    items = []
    for raw in data.pop('addenda', ()):
        item = dict(raw)
        for field in ('id', 'author_id', 'dentist_id'):
            item[field] = UUID(str(item[field]))
        if not isinstance(item['recorded_at'], datetime):
            item['recorded_at'] = datetime.fromisoformat(item['recorded_at'])
        item['recorded_at'] = item['recorded_at'].astimezone(timezone.utc)
        items.append(ClinicalAddendum(**item))
    return ClinicalRecord(**data, addenda=tuple(items))


class SqlAlchemyClinicalRecordRepository:
    def __init__(self, session: Session):
        self.session = session

    def _authorize(self, users, actor_id, session_id, action):
        actor = users.get(actor_id)
        if actor is None or not actor.is_active or not users.session_active(session_id, actor_id):
            raise UnauthorizedError('Sessão inválida para acessar o prontuário.')
        # Raw stored matrix: no default grants and no administrator bypass.
        permissions = self.session.scalar(sql('SELECT permissions FROM role_permissions WHERE role=:role'),
                                          {'role': actor.role.value}) or {}
        require_clinical_permission(actor, permissions, action)
        return actor, permissions

    def _load(self, record_id):
        row = self.session.execute(sql('SELECT * FROM clinical_records WHERE id=:id FOR UPDATE'),
                                   {'id': record_id}).mappings().one_or_none()
        if row is None:
            raise NotFoundError('Registro clínico não encontrado.')
        data = dict(row)
        data['addenda'] = [dict(item) for item in self.session.execute(sql('''
            SELECT id,author_id,author_name,dentist_id,text,reason,recorded_at FROM clinical_addenda
            WHERE record_id=:id ORDER BY record_version'''), {'id': record_id}).mappings()]
        return _decode(data)

    def get(self, record_id, *, actor_id, session_id):
        users = SqlAlchemyUserRepository(self.session)
        with users.administration_lock():
            self._authorize(users, actor_id, session_id, 'view')
            return self._load(record_id)

    def list_for_patient(self, patient_id, *, actor_id, session_id, limit=20, offset=0):
        if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or offset < 0:
            raise ValidationError('Paginação clínica inválida.')
        users = SqlAlchemyUserRepository(self.session)
        with users.administration_lock():
            self._authorize(users, actor_id, session_id, 'view')
            params = {'patient': patient_id, 'limit': limit, 'offset': offset}
            total = self.session.scalar(sql('SELECT count(*) FROM clinical_records WHERE patient_id=:patient'), params)
            ids = self.session.scalars(sql('''SELECT id FROM clinical_records WHERE patient_id=:patient
                ORDER BY created_at DESC,id DESC LIMIT :limit OFFSET :offset'''), params).all()
            return {'items': [self._load(item) for item in ids], 'total': total}

    def execute(self, action, target_id, *, actor_id, session_id, key, version=None, text=None, reason=None):
        """Target is appointment on create, record otherwise. Commit receipt + result together.

        Caller supplies authenticated identity/session only. Permissions, author,
        appointment and context are reread under the existing administration lock.
        Exact retries return their captured result, not a newer mutable draft.
        """
        if action not in ('create', 'save', 'finalize', 'addendum'):
            raise ValidationError('Operação clínica inválida.')
        if not isinstance(key, UUID) or not isinstance(target_id, UUID):
            raise ValidationError('Identificador de operação clínica inválido.')
        if action == 'create' and (version is not None or reason is not None):
            raise ValidationError('Campos incompatíveis com criação clínica.')
        if action == 'save' and reason is not None:
            raise ValidationError('Campos incompatíveis com edição clínica.')
        if action == 'finalize' and (text is not None or reason is not None):
            raise ValidationError('A finalização utiliza o rascunho salvo.')
        payload = dict(action=action, target_id=target_id, version=version, text=text, reason=reason)
        digest = hashlib.sha256(_json(payload).encode()).hexdigest()
        users = SqlAlchemyUserRepository(self.session)
        try:
            with users.administration_lock():
                actor, grants = self._authorize(users, actor_id, session_id, 'create' if action == 'create' else 'update')
                receipt = self.session.execute(sql('''SELECT request_hash,result FROM clinical_operations
                    WHERE actor_id=:actor AND key=:key'''), {'actor': actor_id, 'key': key}).mappings().one_or_none()
                if receipt:
                    if receipt['request_hash'] != digest:
                        raise ConflictError('A tentativa clínica já foi usada com outros dados.')
                    captured = _decode(receipt['result'])
                    if captured.author_id != actor.id or captured.dentist_id != actor.dentist_id:
                        raise ForbiddenError('Vínculo de autoria clínica alterado.')
                    return captured
                if action == 'create':
                    # This row lock coordinates with changes/deletion of the appointment;
                    # the composite FK protects its patient/dentist identity afterwards.
                    self.session.execute(sql('SELECT id FROM appointments WHERE id=:id FOR UPDATE'), {'id': target_id})
                    visit = SqlAlchemyAppointmentRepository(self.session).get(target_id)
                    if visit is None:
                        raise NotFoundError('Consulta não encontrada.')
                    now = self.session.scalar(sql('SELECT clock_timestamp()'))
                    result = create_draft(uuid4(), visit, actor, grants, text, now)
                    self.session.execute(sql('''INSERT INTO clinical_records
                        (id,appointment_id,patient_id,dentist_id,author_id,author_name,text,version,created_at,updated_at)
                        VALUES (:id,:appointment_id,:patient_id,:dentist_id,:author_id,:author_name,:text,:version,:created_at,:updated_at)'''),
                        asdict(result))
                else:
                    current = self._load(target_id)
                    now = self.session.scalar(sql('SELECT clock_timestamp()'))
                    if action == 'save':
                        result = save_draft(current, actor, grants, version, text, now)
                    elif action == 'finalize':
                        patient = self.session.execute(sql('''SELECT allergies,medical_history FROM patients
                            WHERE id=:id FOR SHARE'''), {'id': current.patient_id}).mappings().one()
                        result = finalize(current, actor, grants, version, ClinicalContext(**patient), now)
                    else:
                        result = append_addendum(current, actor, grants, version, uuid4(), text, reason, now)
                    updated = self.session.execute(sql('''UPDATE clinical_records SET text=:text,version=:version,
                        updated_at=:updated_at,finalized_at=:finalized_at,context=CAST(:context AS jsonb)
                        WHERE id=:id AND version=:previous RETURNING id'''),
                        {**asdict(result), 'previous': current.version,
                         'context': _json(asdict(result.context)) if result.context is not None else None}).scalar()
                    if updated is None:
                        raise ConflictError('Registro clínico alterado.', code='stale_version')
                    if action == 'addendum':
                        item = result.addenda[-1]
                        self.session.execute(sql('''INSERT INTO clinical_addenda
                            (id,record_id,author_id,dentist_id,author_name,text,reason,recorded_at,record_version)
                            VALUES (:id,:record_id,:author_id,:dentist_id,:author_name,:text,:reason,:recorded_at,:record_version)'''),
                            {**asdict(item), 'record_id': result.id, 'record_version': result.version})
                self.session.execute(sql('''INSERT INTO clinical_operations(actor_id,key,request_hash,record_id,result)
                    VALUES (:actor,:key,:hash,:record,CAST(:result AS jsonb))'''),
                    {'actor': actor_id, 'key': key, 'hash': digest, 'record': result.id, 'result': _json(asdict(result))})
                self.session.commit()
                return result
        except IntegrityError:
            self.session.rollback()
            raise ConflictError('Operação clínica conflita com um registro ou vínculo existente.') from None
