from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ForbiddenError, UnauthorizedError, ValidationError
from src.core.permissions import (
    PERMISSION_RESOURCES,
    PermissionMatrix,
    get_default_permissions,
    normalize_permissions,
)
from src.core.ports.repositories import RolePermissionRepository, UserRepository


class PermissionUseCases:
    def __init__(self, repository: RolePermissionRepository, user_repository: UserRepository | None = None) -> None:
        self.repository = repository
        self.user_repository = user_repository

    def list_all(self) -> dict[UserRole, PermissionMatrix]:
        result: dict[UserRole, PermissionMatrix] = {}

        for role in UserRole:
            result[role] = self.get_for_role(role)

        return result

    def get_for_role(self, role: UserRole) -> PermissionMatrix:
        if role == UserRole.admin:
            return get_default_permissions(UserRole.admin)

        current = self.repository.get_by_role(role)
        # Defaults are an effective view; only an explicit update persists them.
        return normalize_permissions(role, current.permissions if current else None)

    def update_for_role(self, role: UserRole, permissions: dict[str, dict[str, bool]], *,
                        actor_id: UUID, session_id: UUID) -> PermissionMatrix:
        if self.user_repository is None:
            raise RuntimeError("Permission writes require the administration repository")
        # Same transaction/lock as user edits and session revocation. Recheck after
        # waiting, before validation errors or any permission state can be returned.
        with self.user_repository.administration_lock():
            if not self.user_repository.session_active(session_id, actor_id):
                raise UnauthorizedError("Sessão encerrada. Entre novamente.")
            actor = self.user_repository.get(actor_id)
            if actor is None or not actor.is_active or actor.role != UserRole.admin:
                raise ForbiddenError("Acesso restrito a administrador ativo.")
            if role == UserRole.admin:
                raise ValidationError("Permissões do perfil Administrador não podem ser alteradas.")

            self._validate_resources(permissions)
            normalized = normalize_permissions(role, permissions)
            self.repository.upsert(role, normalized)
            return normalized

    def _validate_resources(self, permissions: dict[str, dict[str, bool]]) -> None:
        invalid_resources = sorted(resource for resource in permissions.keys() if resource not in PERMISSION_RESOURCES)
        if invalid_resources:
            values = ", ".join(invalid_resources)
            raise ValidationError(f"Recursos de permissão inválidos: {values}.")
