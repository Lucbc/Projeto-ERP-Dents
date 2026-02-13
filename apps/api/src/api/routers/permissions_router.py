from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.adapters.db.repositories.role_permission_repository import SqlAlchemyRolePermissionRepository
from src.api.deps.auth import get_current_user, require_admin
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
    return PermissionUseCases(SqlAlchemyRolePermissionRepository(db))


@router.get("/me", response_model=RolePermissionResponse)
def get_my_permissions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_dep),
) -> RolePermissionResponse:
    use_case = build_use_case(db)
    permissions = use_case.get_for_role(current_user.role)
    return RolePermissionResponse(role=current_user.role, permissions=permissions)


@router.get("", response_model=RolePermissionListResponse, dependencies=[Depends(require_admin)])
def list_role_permissions(db: Session = Depends(get_db_dep)) -> RolePermissionListResponse:
    use_case = build_use_case(db)
    mapped = use_case.list_all()
    items = [RolePermissionResponse(role=role, permissions=mapped[role]) for role in UserRole]
    return RolePermissionListResponse(items=items)


@router.put(
    "/{role}",
    response_model=RolePermissionResponse,
    dependencies=[Depends(require_admin)],
)
def update_role_permissions(
    role: UserRole,
    payload: RolePermissionUpdateRequest,
    db: Session = Depends(get_db_dep),
) -> RolePermissionResponse:
    use_case = build_use_case(db)
    permissions = use_case.update_for_role(
        role=role,
        permissions={key: value.model_dump() for key, value in payload.permissions.items()},
    )
    return RolePermissionResponse(role=role, permissions=permissions)
