from __future__ import annotations

from copy import deepcopy

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.adapters.db.models.models import RolePermissionModel
from src.core.domain.entities import RolePermission, UserRole
from src.core.ports.repositories import RolePermissionRepository


class SqlAlchemyRolePermissionRepository(RolePermissionRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_role(self, role: UserRole) -> RolePermission | None:
        item = self.session.get(RolePermissionModel, role)
        return self._to_entity(item) if item else None

    def list_all(self) -> list[RolePermission]:
        items = self.session.scalars(select(RolePermissionModel).order_by(RolePermissionModel.role.asc())).all()
        return [self._to_entity(item) for item in items]

    def upsert(self, role: UserRole, permissions: dict[str, dict[str, bool]]) -> RolePermission:
        item = self.session.get(RolePermissionModel, role)
        if item is None:
            item = RolePermissionModel(role=role, permissions=permissions)
            self.session.add(item)
        else:
            item.permissions = permissions

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def _to_entity(self, model: RolePermissionModel) -> RolePermission:
        return RolePermission(
            role=model.role,
            permissions=deepcopy(model.permissions),
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
