from __future__ import annotations

from uuid import UUID, uuid4
from datetime import datetime, timezone
from hmac import compare_digest

from src.core.domain.entities import User, UserRole
from src.core.domain.exceptions import ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError
from src.core.ports.repositories import UserRepository
from src.core.ports.services import AuthService
from src.core.password_policy import validate_new_password


class AuthUseCases:
    def __init__(self, user_repository: UserRepository, auth_service: AuthService,
                 bootstrap_token: str = "") -> None:
        self.user_repository = user_repository
        self.auth_service = auth_service
        self.bootstrap_token = bootstrap_token

    def needs_bootstrap(self) -> bool:
        return not self.user_repository.bootstrap_completed() and self.user_repository.count_all() == 0

    def bootstrap_admin(self, name: str, email: str, password: str,
                        activation_token: str | None = None) -> User:
        if not self.needs_bootstrap():
            raise ConflictError("A configuração inicial já foi concluída ou está indisponível.")

        if (len(self.bootstrap_token) < 32 or not activation_token or len(activation_token) > 256
                or not compare_digest(self.bootstrap_token.encode(), activation_token.encode())):
            raise ForbiddenError("Código de ativação inválido ou não configurado no servidor.")

        if not name.strip():
            raise ValidationError("Nome é obrigatório.")

        validate_new_password(password)

        password_hash = self.auth_service.hash_password(password)
        with self.user_repository.administration_lock():
            # Another worker may have initialized while this request validated/hashed.
            if not self.needs_bootstrap():
                raise ConflictError("A configuração inicial já foi concluída.")
            return self.user_repository.complete_bootstrap({
                "name": name.strip(),
                "email": email.lower().strip(),
                "role": UserRole.admin,
                "password_hash": password_hash,
                "is_active": True,
                "dentist_id": None,
            })

    def login(self, email: str, password: str) -> tuple[str, User]:
        user = self.user_repository.get_by_email(email.lower().strip())
        valid = self.auth_service.verify_password(password, user.password_hash if user else "")
        if user is None or not valid or not user.is_active:
            raise UnauthorizedError("Credenciais inválidas.")

        # Hash verification is expensive; serialize only its final recheck and session creation.
        with self.user_repository.administration_lock():
            current = self.user_repository.get(user.id)
            if (current is None or not current.is_active or current.password_hash != user.password_hash
                    or current.email != user.email):
                raise UnauthorizedError("Credenciais alteradas. Entre novamente.")
            session_id = uuid4()
            token = self.auth_service.create_access_token(
                subject=str(current.id), extra_claims={"jti": str(session_id)},
            )
            claims = self.auth_service.decode_access_token(token)
            if claims is None:
                raise UnauthorizedError("Falha ao criar sessão.")
            self.user_repository.create_session(session_id, current.id,
                datetime.fromtimestamp(claims["exp"], timezone.utc))
            return token, current

    def logout(self, token: str) -> None:
        claims = self.auth_service.decode_access_token(token)
        if claims is None:
            return
        try:
            session_id, user_id = UUID(str(claims["jti"])), UUID(str(claims["sub"]))
        except (KeyError, ValueError, TypeError):
            return
        self.user_repository.revoke_session(session_id, user_id)

    def change_password(self, user_id: UUID, current_password: str, new_password: str) -> None:
        with self.user_repository.administration_lock():
            user = self.user_repository.get(user_id)
            if user is None:
                raise NotFoundError("Usuário não encontrado.")

            if not self.auth_service.verify_password(current_password, user.password_hash):
                raise ValidationError("Senha atual inválida.")

            validate_new_password(new_password)

            if current_password == new_password:
                raise ValidationError("A nova senha deve ser diferente da senha atual.")

            password_hash = self.auth_service.hash_password(new_password)
            self.user_repository.update(user_id, {"password_hash": password_hash})

    def me(self, user_id: UUID) -> User:
        user = self.user_repository.get(user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        return user

