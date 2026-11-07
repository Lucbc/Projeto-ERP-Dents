from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.adapters.db.repositories.administrative_audit_reader import AdministrativeAuditReader
from src.api.deps.auth import get_current_user, get_current_session_id
from src.api.deps.db import get_db_dep
from src.core.domain.entities import User, UserRole

AuditAction = Literal['user.created', 'user.updated', 'user.password_reset', 'user.deleted', 'permissions.updated']


class PermissionChange(BaseModel):
    resource: str
    action: str
    before: bool
    after: bool


class AuditEvent(BaseModel):
    id: UUID
    occurred_at: datetime
    actor_id: UUID
    action: AuditAction
    target_user_id: UUID | None
    target_role: UserRole | None
    before_version: int | None
    after_version: int | None
    changed_fields: list[str]
    permission_changes: list[PermissionChange]


class AuditPage(BaseModel):
    items: list[AuditEvent]
    next_cursor: str | None


router = APIRouter(prefix='/api/administrative-audit', tags=['administrative-audit'])


@router.get('', response_model=AuditPage)
def list_events(response: Response, limit: int = Query(25, ge=1, le=100),
                cursor: str | None = Query(None, max_length=512), action: AuditAction | None = None,
                author_id: UUID | None = None, target_user_id: UUID | None = None,
                target_role: UserRole | None = None, since: datetime | None = None, until: datetime | None = None,
                actor: User = Depends(get_current_user), session_id: UUID = Depends(get_current_session_id),
                db: Session = Depends(get_db_dep)):
    response.headers['Cache-Control'] = 'no-store'
    return AdministrativeAuditReader(db).list(actor_id=actor.id, session_id=session_id, limit=limit,
        cursor=cursor, action=action, author_id=author_id, target_user_id=target_user_id,
        target_role=target_role, since=since, until=until)
