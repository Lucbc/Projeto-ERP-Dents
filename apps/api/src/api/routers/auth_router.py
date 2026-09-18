from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request, Response, HTTPException
from sqlalchemy.orm import Session

from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.adapters.security.jwt_auth_service import JwtAuthService
from src.api.deps.auth import get_current_user
from src.api.browser_session import (get_cookie_token, session_cookie, set_session_cookie,
                                     anonymous_context, marker, csrf)
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    BootstrapAdminRequest,
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    NeedsBootstrapResponse,
    SessionResponse,
    UserResponse,
)
from src.core.domain.entities import User
from src.core.use_cases.auth_use_cases import AuthUseCases
from src.config import get_settings
from src.adapters.db.auth_limiter import AuthLimiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/logout", response_model=MessageResponse)
def logout(token: str = Depends(get_cookie_token), db: Session = Depends(get_db_dep)) -> MessageResponse:
    # Revocation is idempotent. Never clear a newer login's cookie with a late response.
    AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService()).logout(token)
    return MessageResponse(detail="Sessão encerrada.")


@router.get("/needs-bootstrap", response_model=NeedsBootstrapResponse)
def needs_bootstrap(db: Session = Depends(get_db_dep)) -> NeedsBootstrapResponse:
    use_case = AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    return NeedsBootstrapResponse(needsBootstrap=use_case.needs_bootstrap())


@router.post("/bootstrap-admin", response_model=UserResponse)
def bootstrap_admin(
    payload: BootstrapAdminRequest,
    request: Request,
    db: Session = Depends(get_db_dep),
    activation_token: str | None = Header(default=None, alias="X-Bootstrap-Token"),
) -> User:
    AuthLimiter(db, get_settings().jwt_secret_key).consume([
        ("bootstrap-origin", request.client.host if request.client else "unknown", 10),
    ])
    use_case = AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService(), get_settings().bootstrap_token)
    return use_case.bootstrap_admin(payload.name, payload.email, payload.password, activation_token)


@router.post("/login", response_model=SessionResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db_dep)) -> SessionResponse:
    AuthLimiter(db, get_settings().jwt_secret_key).consume([
        ("login-account", payload.email.lower().strip(), 10),
        ("login-origin", request.client.host if request.client else "unknown", 120),
    ])
    use_case = AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    token, user = use_case.login(payload.email, payload.password)
    set_session_cookie(response, token)
    return session_response(token, user)


def session_response(token: str, user: User) -> SessionResponse:
    claims = JwtAuthService().decode_access_token(token)
    return SessionResponse(session_id=marker(token), csrf_token=csrf(token),
                           expires_at=claims["exp"] * 1000, user=UserResponse.model_validate(user))


@router.get("/session", response_model=SessionResponse)
def browser_session(request: Request, response: Response, db: Session = Depends(get_db_dep)):
    response.headers["Cache-Control"] = "no-store"
    anonymous = anonymous_context(request, response)
    token = session_cookie(request)
    claims = JwtAuthService().decode_access_token(token) if token else None
    if claims and claims.get("transport") == "cookie-v1":
        try:
            user = get_current_user(token, db, JwtAuthService())
            return session_response(token, user)
        except HTTPException:
            pass
    return anonymous


@router.get("/challenge")
def challenge(request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return anonymous_context(request, response)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_dep),
) -> MessageResponse:
    AuthLimiter(db, get_settings().jwt_secret_key).consume([("change-password", str(current_user.id), 5)])
    use_case = AuthUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    use_case.change_password(current_user.id, payload.current_password, payload.new_password)
    return MessageResponse(detail="Senha atualizada com sucesso.")
