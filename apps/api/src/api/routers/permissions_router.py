from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.adapters.db.repositories.role_permission_repository import SqlAlchemyRolePermissionRepository
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.api.deps.auth import get_current_user, get_current_session_id, require_admin
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    RolePermissionListResponse,
    RolePermissionResponse,
    RolePermissionUpdateRequest,
)
from src.core.domain.entities import User, UserRole
from src.core.use_cases.permission_use_cases import PermissionUseCases

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


def build_use_case(db: Session) -> PermissionUseCases:
    return PermissionUseCases(SqlAlchemyRolePermissionRepository(db), SqlAlchemyUserRepository(db))


@router.get("/me", response_model=RolePermissionResponse)
def get_my_permissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_dep),
) -> RolePermissionResponse:
    use_case = build_use_case(db)
    version, permissions = use_case.get_versioned(current_user.role)
    return RolePermissionResponse(role=current_user.role, version=version, permissions=permissions)


@router.get("", response_model=RolePermissionListResponse, dependencies=[Depends(require_admin)])
def list_role_permissions(db: Session = Depends(get_db_dep)) -> RolePermissionListResponse:
    use_case = build_use_case(db)
    mapped = use_case.list_all()
    items = [RolePermissionResponse(role=role, version=mapped[role][0], permissions=mapped[role][1]) for role in UserRole]
    return RolePermissionListResponse(items=items)


@router.put(
    "/{role}",
    response_model=RolePermissionResponse,
    dependencies=[Depends(require_admin)],
)
def update_role_permissions(
    role: UserRole,
    payload: RolePermissionUpdateRequest,
    current_user: User = Depends(require_admin),
    session_id: UUID = Depends(get_current_session_id),
    db: Session = Depends(get_db_dep),
) -> RolePermissionResponse:
    use_case = build_use_case(db)
    permissions = use_case.update_for_role(
        role=role,
        version=payload.version,
        permissions={key: value.model_dump() for key, value in payload.permissions.items()},
        actor_id=current_user.id,
        session_id=session_id,
    )
    return RolePermissionResponse(role=role, version=permissions.version, permissions=permissions.permissions)
