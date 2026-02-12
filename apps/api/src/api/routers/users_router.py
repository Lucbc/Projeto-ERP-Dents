from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.adapters.security.jwt_auth_service import JwtAuthService
from src.api.deps.auth import require_admin
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    SetPasswordRequest,
    UserCreateRequest,
    UserListResponse,
    UserResponse,
    UserUpdateRequest,
)
from src.core.use_cases.user_use_cases import UserUseCases

router = APIRouter(
    prefix="/api/users",
    tags=["users"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=UserListResponse)
def list_users(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_dep),
) -> UserListResponse:
    use_case = UserUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    items, total = use_case.list(search=search, limit=limit, offset=offset)
    return UserListResponse(
        items=[UserResponse.model_validate(item) for item in items],
        total=total,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateRequest, db: Session = Depends(get_db_dep)):
    use_case = UserUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    return use_case.create(payload.model_dump())


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = UserUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    return use_case.get(user_id)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: UUID, payload: UserUpdateRequest, db: Session = Depends(get_db_dep)):
    use_case = UserUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    return use_case.update(user_id, payload.model_dump(exclude_unset=True))


@router.post("/{user_id}/set-password", response_model=UserResponse)
def set_password(user_id: UUID, payload: SetPasswordRequest, db: Session = Depends(get_db_dep)):
    use_case = UserUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    return use_case.set_password(user_id, payload.new_password)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: UUID, db: Session = Depends(get_db_dep)) -> None:
    use_case = UserUseCases(SqlAlchemyUserRepository(db), JwtAuthService())
    use_case.delete(user_id)
