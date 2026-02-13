from __future__ import annotations

from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ValidationError
from src.core.permissions import (
    PERMISSION_RESOURCES,
    PermissionMatrix,
    get_default_permissions,
    normalize_permissions,
)
from src.core.ports.repositories import RolePermissionRepository


class PermissionUseCases:
    def __init__(self, repository: RolePermissionRepository) -> None:
        self.repository = repository

    def list_all(self) -> dict[UserRole, PermissionMatrix]:
        result: dict[UserRole, PermissionMatrix] = {}

        for role in UserRole:
            result[role] = self.get_for_role(role)

        return result

    def get_for_role(self, role: UserRole) -> PermissionMatrix:
        if role == UserRole.admin:
            return get_default_permissions(UserRole.admin)

        current = self.repository.get_by_role(role)
        normalized = normalize_permissions(role, current.permissions if current else None)

        if current is None or current.permissions != normalized:
            self.repository.upsert(role, normalized)

        return normalized

    def update_for_role(self, role: UserRole, permissions: dict[str, dict[str, bool]]) -> PermissionMatrix:
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
