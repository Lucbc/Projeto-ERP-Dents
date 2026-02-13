from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.adapters.db.repositories.role_permission_repository import SqlAlchemyRolePermissionRepository
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.adapters.security.jwt_auth_service import JwtAuthService
from src.api.deps.db import get_db_dep
from src.core.domain.entities import User, UserRole
from src.core.permissions import PermissionAction, PermissionResource, can_access, normalize_permissions

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_auth_service() -> JwtAuthService:
    return JwtAuthService()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db_dep),
    auth_service: JwtAuthService = Depends(get_auth_service),
) -> User:
    payload = auth_service.decode_access_token(token)
    if payload is None or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

    try:
        user_id = UUID(str(payload["sub"]))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.") from exc

    user = SqlAlchemyUserRepository(db).get(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado.")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo.")

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a admin.")
    return current_user


def require_permission(resource: PermissionResource, action: PermissionAction) -> Callable:
    def dependency(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db_dep),
    ) -> User:
        if current_user.role == UserRole.admin:
            return current_user

        repository = SqlAlchemyRolePermissionRepository(db)
        current = repository.get_by_role(current_user.role)
        normalized = normalize_permissions(
            role=current_user.role,
            raw_permissions=current.permissions if current else None,
        )

        if current is None or current.permissions != normalized:
            repository.upsert(current_user.role, normalized)

        if not can_access(
            role=current_user.role,
            permissions=normalized,
            resource=resource,
            action=action,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sem permissão para executar esta ação.",
            )

        return current_user

    return dependency
