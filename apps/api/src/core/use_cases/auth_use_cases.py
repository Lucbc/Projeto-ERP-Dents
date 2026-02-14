from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import User, UserRole
from src.core.domain.exceptions import ConflictError, NotFoundError, UnauthorizedError, ValidationError
from src.core.ports.repositories import UserRepository
from src.core.ports.services import AuthService


class AuthUseCases:
    def __init__(self, user_repository: UserRepository, auth_service: AuthService) -> None:
        self.user_repository = user_repository
        self.auth_service = auth_service

    def needs_bootstrap(self) -> bool:
        return self.user_repository.count_all() == 0

    def bootstrap_admin(self, name: str, email: str, password: str) -> User:
        if not self.needs_bootstrap():
            raise ConflictError("Bootstrap já foi concluído. Já existe usuário cadastrado.")

        if len(password) < 8:
            raise ValidationError("A senha deve ter no mínimo 8 caracteres.")

        password_hash = self.auth_service.hash_password(password)
        return self.user_repository.create(
            {
                "name": name,
                "email": email.lower().strip(),
                "role": UserRole.admin,
                "password_hash": password_hash,
                "is_active": True,
                "dentist_id": None,
            }
        )

    def login(self, email: str, password: str) -> tuple[str, User]:
        user = self.user_repository.get_by_email(email.lower().strip())
        if user is None:
            raise UnauthorizedError("Credenciais inválidas.")

        if not user.is_active:
            raise UnauthorizedError("Usuário inativo.")

        if not self.auth_service.verify_password(password, user.password_hash):
            raise UnauthorizedError("Credenciais inválidas.")

        token = self.auth_service.create_access_token(
            subject=str(user.id),
            extra_claims={"role": user.role.value, "email": user.email},
        )
        return token, user

    def change_password(self, user_id: UUID, current_password: str, new_password: str) -> None:
        user = self.user_repository.get(user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")

        if not self.auth_service.verify_password(current_password, user.password_hash):
            raise UnauthorizedError("Senha atual inválida.")

        if len(new_password) < 8:
            raise ValidationError("A nova senha deve ter no mínimo 8 caracteres.")

        if current_password == new_password:
            raise ValidationError("A nova senha deve ser diferente da senha atual.")

        password_hash = self.auth_service.hash_password(new_password)
        self.user_repository.update(user_id, {"password_hash": password_hash})

    def me(self, user_id: UUID) -> User:
        user = self.user_repository.get(user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        return user

