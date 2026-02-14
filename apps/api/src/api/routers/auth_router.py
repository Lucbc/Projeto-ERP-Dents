from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.adapters.security.jwt_auth_service import JwtAuthService
from src.api.deps.auth import get_current_user
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    BootstrapAdminRequest,
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    NeedsBootstrapResponse,
    TokenResponse,
    UserResponse,
)
from src.core.domain.entities import User
from src.core.use_cases.auth_use_cases import AuthUseCases

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/needs-bootstrap", response_model=NeedsBootstrapResponse)
def needs_bootstrap(db: Session = Depends(get_db_dep)) -> NeedsBootstrapResponse:
    use_case = AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    return NeedsBootstrapResponse(needsBootstrap=use_case.needs_bootstrap())


@router.post("/bootstrap-admin", response_model=UserResponse)
def bootstrap_admin(
    payload: BootstrapAdminRequest,
    db: Session = Depends(get_db_dep),
) -> User:
    use_case = AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    return use_case.bootstrap_admin(payload.name, payload.email, payload.password)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db_dep)) -> TokenResponse:
    use_case = AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    token, user = use_case.login(payload.email, payload.password)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_dep),
) -> MessageResponse:
    use_case = AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    use_case.change_password(current_user.id, payload.current_password, payload.new_password)
    return MessageResponse(detail="Senha atualizada com sucesso.")
