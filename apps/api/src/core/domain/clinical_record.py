"""Clinical transitions, independent of storage and HTTP.

Callers must obtain actor, permissions, appointment and clinical context from the
server. Persistence must atomically compare versions and store operation receipts;
these immutable transitions alone do not provide concurrency or replay guarantees.
"""
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from uuid import UUID

from src.core.domain.entities import Appointment, User, UserRole
from src.core.domain.exceptions import ConflictError, ForbiddenError, ValidationError


@dataclass(frozen=True, slots=True)
class ClinicalContext:
    allergies: str | None
    medical_history: str | None


@dataclass(frozen=True, slots=True)
class ClinicalAddendum:
    id: UUID
    author_id: UUID
    author_name: str
    dentist_id: UUID
    text: str
    reason: str
    recorded_at: datetime


@dataclass(frozen=True, slots=True)
class ClinicalRecord:
    id: UUID
    appointment_id: UUID
    patient_id: UUID
    dentist_id: UUID
    author_id: UUID
    author_name: str
    text: str
    version: int
    created_at: datetime
    updated_at: datetime
    finalized_at: datetime | None = None
    context: ClinicalContext | None = None
    addenda: tuple[ClinicalAddendum, ...] = ()


def require_clinical_permission(actor: User, permissions: dict, action: str) -> None:
    """No administrator bypass, role default or implicit write from read access."""
    grants = permissions.get('clinical_records', {})
    if (action not in ('view', 'create', 'update') or not actor.is_active
            or grants.get('view') is not True or grants.get(action) is not True):
        raise ForbiddenError('Sem permissão para esta operação no prontuário.')
    if action != 'view' and (actor.role != UserRole.dentist or actor.dentist_id is None):
        raise ForbiddenError('A escrita clínica exige usuário dentista vinculado.')


def _instant(now: datetime) -> datetime:
    if not isinstance(now, datetime) or now.tzinfo is None or now.utcoffset() is None:
        raise ValidationError('O instante do registro clínico deve conter fuso.')
    return now.astimezone(timezone.utc)


def _text(value: str, *, required: bool) -> str:
    if not isinstance(value, str) or (required and not value.strip()):
        raise ValidationError('Informe o texto obrigatório do registro clínico.')
    # Preserve exactly what the author wrote; whitespace is not an audit rewrite.
    return value


def _edit(record: ClinicalRecord, actor: User, permissions: dict, version: int, now: datetime) -> datetime:
    require_clinical_permission(actor, permissions, 'update')
    if actor.id != record.author_id or actor.dentist_id != record.dentist_id:
        raise ForbiddenError('Somente o autor pode alterar este registro clínico.')
    if type(version) is not int or version < 1:
        raise ValidationError('Informe uma versão válida do registro clínico.')
    if version != record.version:
        raise ConflictError('O registro clínico foi alterado. Recarregue antes de continuar.', code='stale_version')
    stamp = _instant(now)
    if stamp < record.updated_at:
        raise ValidationError('O instante da operação não pode anteceder o registro atual.')
    return stamp


def create_draft(record_id: UUID, appointment: Appointment, actor: User, permissions: dict,
                 text: str, now: datetime) -> ClinicalRecord:
    require_clinical_permission(actor, permissions, 'create')
    if actor.dentist_id != appointment.dentist_id:
        raise ForbiddenError('A consulta pertence a outro dentista.')
    stamp = _instant(now)
    return ClinicalRecord(id=record_id, appointment_id=appointment.id, patient_id=appointment.patient_id,
                          dentist_id=appointment.dentist_id, author_id=actor.id, author_name=actor.name,
                          text=_text(text, required=False), version=1, created_at=stamp, updated_at=stamp)


def save_draft(record: ClinicalRecord, actor: User, permissions: dict, version: int,
               text: str, now: datetime) -> ClinicalRecord:
    stamp = _edit(record, actor, permissions, version, now)
    if record.finalized_at is not None:
        raise ConflictError('Registro finalizado: utilize um adendo para corrigir.')
    return replace(record, text=_text(text, required=False), version=record.version + 1, updated_at=stamp)


def finalize(record: ClinicalRecord, actor: User, permissions: dict, version: int,
             context: ClinicalContext, now: datetime) -> ClinicalRecord:
    stamp = _edit(record, actor, permissions, version, now)
    if record.finalized_at is not None:
        raise ConflictError('O registro clínico já está finalizado.')
    _text(record.text, required=True)
    if not isinstance(context, ClinicalContext):
        raise ValidationError('Contexto clínico inválido para finalização.')
    for value in (context.allergies, context.medical_history):
        if value is not None:
            _text(value, required=False)
    return replace(record, context=context, finalized_at=stamp, updated_at=stamp, version=record.version + 1)


def append_addendum(record: ClinicalRecord, actor: User, permissions: dict, version: int,
                    addendum_id: UUID, text: str, reason: str, now: datetime) -> ClinicalRecord:
    stamp = _edit(record, actor, permissions, version, now)
    if record.finalized_at is None:
        raise ConflictError('Finalize o registro antes de acrescentar um adendo.')
    if any(item.id == addendum_id for item in record.addenda):
        raise ConflictError('O adendo já está registrado.')
    item = ClinicalAddendum(id=addendum_id, author_id=actor.id, author_name=actor.name,
                            dentist_id=record.dentist_id, text=_text(text, required=True),
                            reason=_text(reason, required=True), recorded_at=stamp)
    return replace(record, addenda=(*record.addenda, item), updated_at=stamp, version=record.version + 1)
