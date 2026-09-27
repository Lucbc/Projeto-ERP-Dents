from __future__ import annotations

from copy import deepcopy

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from src.adapters.db.models.models import RolePermissionModel
from src.core.domain.entities import RolePermission, UserRole
from src.core.domain.exceptions import ConflictError
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

    def save(self, role: UserRole, permissions: dict[str, dict[str, bool]], version: int) -> RolePermission:
        try:
            if version == 0:
                stmt = insert(RolePermissionModel).values(role=role, permissions=permissions, version=1).on_conflict_do_nothing(
                    index_elements=[RolePermissionModel.role])
            else:
                stmt = update(RolePermissionModel).where(RolePermissionModel.role == role,
                    RolePermissionModel.version == version).values(permissions=permissions, version=version + 1)
            item = self.session.scalars(stmt.returning(RolePermissionModel),
                execution_options={'populate_existing': True}).one_or_none()
            if item is None:
                raise ConflictError('As permissões foram alteradas. Carregue a versão atual e revise antes de salvar.',
                                    code='stale_version')
            result = self._to_entity(item)
            self.session.commit()
            return result
        except Exception:
            self.session.rollback()
            raise

    def _to_entity(self, model: RolePermissionModel) -> RolePermission:
        return RolePermission(
            version=model.version,
            role=model.role,
            permissions=deepcopy(model.permissions),
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
