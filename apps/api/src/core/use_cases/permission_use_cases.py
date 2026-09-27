from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import RolePermission, UserRole
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

    def list_all(self) -> dict[UserRole, tuple[int, PermissionMatrix]]:
        result: dict[UserRole, tuple[int, PermissionMatrix]] = {}

        for role in UserRole:
            result[role] = self.get_versioned(role)

        return result

    def get_for_role(self, role: UserRole) -> PermissionMatrix:
        return self.get_versioned(role)[1]

    def get_versioned(self, role: UserRole) -> tuple[int, PermissionMatrix]:
        if role == UserRole.admin:
            return 0, get_default_permissions(UserRole.admin)

        current = self.repository.get_by_role(role)
        # Defaults are an effective view; only an explicit update persists them.
        return (current.version if current else 0), normalize_permissions(role, current.permissions if current else None)

    def update_for_role(self, role: UserRole, permissions: dict[str, dict[str, bool]], *,
                        version: int, actor_id: UUID, session_id: UUID) -> RolePermission:
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
            if type(version) is not int or not 0 <= version < 2**63 - 1:
                raise ValidationError('Informe uma versão válida das permissões.')

            self._validate_resources(permissions)
            normalized = normalize_permissions(role, permissions)
            return self.repository.save(role, normalized, version)

    def _validate_resources(self, permissions: dict[str, dict[str, bool]]) -> None:
        invalid_resources = sorted(resource for resource in permissions.keys() if resource not in PERMISSION_RESOURCES)
        if invalid_resources:
            values = ", ".join(invalid_resources)
            raise ValidationError(f"Recursos de permissão inválidos: {values}.")
