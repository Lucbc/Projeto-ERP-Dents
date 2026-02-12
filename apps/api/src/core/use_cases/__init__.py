from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import User, UserRole
from src.core.domain.exceptions import ConflictError, NotFoundError, ValidationError
from src.core.ports.repositories import UserRepository
from src.core.ports.services import AuthService


class UserUseCases:
    def __init__(self, user_repository: UserRepository, auth_service: AuthService) -> None:
        self.user_repository = user_repository
        self.auth_service = auth_service

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[User], int]:
        return self.user_repository.list(search=search, limit=limit, offset=offset)

    def get(self, user_id: UUID) -> User:
        user = self.user_repository.get(user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        return user

    def create(self, data: dict) -> User:
        if len(data.get("password", "")) < 8:
            raise ValidationError("A senha deve ter no mínimo 8 caracteres.")

        existing = self.user_repository.get_by_email(data["email"].lower().strip())
        if existing is not None:
            raise ConflictError("Já existe usuário com este email.")

        role = UserRole(data["role"])
        password_hash = self.auth_service.hash_password(data["password"])

        return self.user_repository.create(
            {
                "name": data["name"].strip(),
                "email": data["email"].lower().strip(),
                "role": role,
                "dentist_id": data.get("dentist_id"),
                "password_hash": password_hash,
                "is_active": data.get("is_active", True),
            }
        )

    def update(self, user_id: UUID, data: dict) -> User:
        if "email" in data:
            existing = self.user_repository.get_by_email(data["email"].lower().strip())
            if existing is not None and existing.id != user_id:
                raise ConflictError("Já existe usuário com este email.")
            data["email"] = data["email"].lower().strip()

        if "role" in data:
            data["role"] = UserRole(data["role"])

        if "name" in data and not data["name"].strip():
            raise ValidationError("Nome é obrigatório.")

        user = self.user_repository.update(user_id, data)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        return user

    def set_password(self, user_id: UUID, new_password: str) -> User:
        if len(new_password) < 8:
            raise ValidationError("A senha deve ter no mínimo 8 caracteres.")

        password_hash = self.auth_service.hash_password(new_password)
        user = self.user_repository.update(user_id, {"password_hash": password_hash})
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        return user

    def delete(self, user_id: UUID) -> None:
        deleted = self.user_repository.delete(user_id)
        if not deleted:
            raise NotFoundError("Usuário não encontrado.")

