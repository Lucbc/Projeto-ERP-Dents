from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.adapters.db.repositories.access_audit_reader import AccessAuditReader
from src.api.deps.auth import get_current_user, get_current_session_id
from src.api.deps.db import get_db_dep
from src.core.domain.entities import User

AuditAction = Literal['clinical.record_read', 'clinical.appointment_read', 'clinical.patient_list', 'exam.download_prepared']


class AuditEvent(BaseModel):
    id: UUID
    occurred_at: datetime
    actor_id: UUID
    action: AuditAction
    patient_id: UUID | None
    target_id: UUID
    record_ids: list[UUID]
    record_versions: list[int]
    returned_count: int
    page_limit: int | None
    page_offset: int | None


class AuditPage(BaseModel):
    items: list[AuditEvent]
    next_cursor: str | None


router = APIRouter(prefix='/api/access-audit', tags=['access-audit'])


@router.get('', response_model=AuditPage)
def list_events(response: Response, limit: int = Query(25, ge=1, le=100),
                cursor: str | None = Query(None, max_length=512), action: AuditAction | None = None,
                author_id: UUID | None = None, patient_id: UUID | None = None, target_id: UUID | None = None,
                since: datetime | None = None, until: datetime | None = None,
                actor: User = Depends(get_current_user), session_id: UUID = Depends(get_current_session_id),
                db: Session = Depends(get_db_dep)):
    response.headers['Cache-Control'] = 'no-store'
    return AccessAuditReader(db).list(actor_id=actor.id, session_id=session_id, limit=limit,
        cursor=cursor, action=action, author_id=author_id, patient_id=patient_id, target_id=target_id,
        since=since, until=until)
