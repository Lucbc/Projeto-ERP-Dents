from __future__ import annotations

from contextlib import contextmanager
from uuid import UUID

from src.core.domain.entities import User, UserRole
from src.core.domain.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from src.core.permissions import PermissionAction, can_access, normalize_permissions
from src.core.ports.repositories import RolePermissionRepository, UserRepository
from src.core.ports.services import AuthService
from src.core.password_policy import validate_new_password


class UserUseCases:
    def __init__(self, user_repository: UserRepository, auth_service: AuthService,
                 permission_repository: RolePermissionRepository) -> None:
        self.user_repository = user_repository
        self.auth_service = auth_service
        self.permission_repository = permission_repository

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[User], int]:
        return self.user_repository.list(search=search, limit=limit, offset=offset)

    def get(self, user_id: UUID) -> User:
        user = self.user_repository.get(user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        return user

    @contextmanager
    def _authorize(self, actor_id: UUID, action: PermissionAction):
        with self.user_repository.administration_lock():
            actor = self.user_repository.get(actor_id)
            if actor is None or not actor.is_active:
                raise ForbiddenError("Usuário sem acesso ativo.")
            # Re-read permissions/identity after acquiring the lock, without committing.
            permission = self.permission_repository.get_by_role(actor.role)
            matrix = normalize_permissions(actor.role, permission.permissions if permission else None)
            if not can_access(actor.role, matrix, "users", action):
                raise ForbiddenError("Sem permissão para executar esta ação.")
            yield actor

    @staticmethod
    def _protect_admin(actor: User, current_role: UserRole, new_role: UserRole | None = None):
        if actor.role != UserRole.admin and UserRole.admin in (current_role, new_role):
            raise ForbiddenError("Somente administradores podem gerenciar contas de administrador.")

    def _protect_last_admin(self, current: User, role: UserRole | None, is_active: bool):
        losing_admin = role != UserRole.admin or not is_active
        if current.role == UserRole.admin and current.is_active and losing_admin:
            if self.user_repository.count_active_admins() <= 1:
                raise ConflictError(
                    "É necessário manter pelo menos um administrador ativo. "
                    "Cadastre ou ative outro administrador antes desta alteração."
                )

    def create(self, data: dict, *, actor_id: UUID) -> User:
        with self._authorize(actor_id, "create") as actor:
            role = UserRole(data["role"])
            self._protect_admin(actor, role)
            validate_new_password(data.get("password", ""))
            if not data["name"].strip():
                raise ValidationError("Nome é obrigatório.")
            if self.user_repository.get_by_email(data["email"].lower().strip()) is not None:
                raise ConflictError("Já existe usuário com este email.")
            return self.user_repository.create({
                "name": data["name"].strip(), "email": data["email"].lower().strip(),
                "role": role, "dentist_id": self._normalize_dentist_id(role, data.get("dentist_id")),
                "password_hash": self.auth_service.hash_password(data["password"]),
                "is_active": data.get("is_active", True),
            })

    def update(self, user_id: UUID, data: dict, *, actor_id: UUID) -> User:
        with self._authorize(actor_id, "update") as actor:
            current = self.get(user_id)
            self._protect_admin(actor, current.role)
            # Null is meaningful only for the optional dentist association.
            if any(key in data and data[key] is None for key in ("name", "email", "role", "is_active")):
                raise ValidationError("Nome, e-mail, perfil e status não podem ser nulos.")
            data = dict(data)
            role = UserRole(data["role"]) if "role" in data else current.role
            self._protect_admin(actor, current.role, role)
            self._protect_last_admin(current, role, data.get("is_active", current.is_active))
            if "email" in data:
                data["email"] = data["email"].lower().strip()
                existing = self.user_repository.get_by_email(data["email"])
                if existing is not None and existing.id != user_id:
                    raise ConflictError("Já existe usuário com este email.")
            if "name" in data:
                data["name"] = data["name"].strip()
                if not data["name"]:
                    raise ValidationError("Nome é obrigatório.")
            data["role"] = role
            dentist_id = data["dentist_id"] if "dentist_id" in data else current.dentist_id
            data["dentist_id"] = self._normalize_dentist_id(role, dentist_id)
            user = self.user_repository.update(user_id, data)
            if user is None:
                raise NotFoundError("Usuário não encontrado.")
            return user

    def set_password(self, user_id: UUID, new_password: str, *, actor_id: UUID) -> User:
        with self._authorize(actor_id, "update") as actor:
            current = self.get(user_id)
            self._protect_admin(actor, current.role)
            validate_new_password(new_password)
            user = self.user_repository.update(user_id, {
                "password_hash": self.auth_service.hash_password(new_password),
            })
            if user is None:
                raise NotFoundError("Usuário não encontrado.")
            return user

    def delete(self, user_id: UUID, *, actor_id: UUID) -> None:
        with self._authorize(actor_id, "delete") as actor:
            current = self.get(user_id)
            self._protect_admin(actor, current.role)
            self._protect_last_admin(current, None, False)
            if not self.user_repository.delete(user_id):
                raise NotFoundError("Usuário não encontrado.")

    def _normalize_dentist_id(self, role: UserRole, dentist_id: UUID | None) -> UUID | None:
        if role == UserRole.dentist:
            if dentist_id is None:
                raise ValidationError("Usuário com perfil Dentista deve ter um dentista associado.")
            return dentist_id
        return None
