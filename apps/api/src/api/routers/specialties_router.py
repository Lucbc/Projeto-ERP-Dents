from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from src.adapters.db.repositories.specialty_repository import SqlAlchemySpecialtyRepository
from src.api.deps.auth import require_permission
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    SpecialtyCreateRequest,
    SpecialtyListResponse,
    SpecialtyResponse,
    SpecialtyUpdateRequest,
)
from src.core.use_cases.specialty_use_cases import SpecialtyUseCases

router = APIRouter(
    prefix="/api/specialties",
    tags=["specialties"],
)


@router.get(
    "",
    response_model=SpecialtyListResponse,
    dependencies=[Depends(require_permission("specialties", "view"))],
)
def list_specialties(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_dep),
) -> SpecialtyListResponse:
    use_case = SpecialtyUseCases(SqlAlchemySpecialtyRepository(db))
    items, total = use_case.list(search=search, limit=limit, offset=offset)
    return SpecialtyListResponse(
        items=[SpecialtyResponse.model_validate(item) for item in items],
        total=total,
    )


@router.post(
    "",
    response_model=SpecialtyResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("specialties", "create"))],
)
def create_specialty(payload: SpecialtyCreateRequest, db: Session = Depends(get_db_dep)):
    use_case = SpecialtyUseCases(SqlAlchemySpecialtyRepository(db))
    return use_case.create(payload.model_dump())


@router.get(
    "/{specialty_id}",
    response_model=SpecialtyResponse,
    dependencies=[Depends(require_permission("specialties", "view"))],
)
def get_specialty(specialty_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = SpecialtyUseCases(SqlAlchemySpecialtyRepository(db))
    return use_case.get(specialty_id)


@router.put(
    "/{specialty_id}",
    response_model=SpecialtyResponse,
    dependencies=[Depends(require_permission("specialties", "update"))],
)
def update_specialty(
    specialty_id: UUID,
    payload: SpecialtyUpdateRequest,
    db: Session = Depends(get_db_dep),
):
    use_case = SpecialtyUseCases(SqlAlchemySpecialtyRepository(db))
    return use_case.update(specialty_id, payload.model_dump(exclude_unset=True))


@router.delete(
    "/{specialty_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_permission("specialties", "delete"))],
)
def delete_specialty(specialty_id: UUID, db: Session = Depends(get_db_dep)) -> Response:
    use_case = SpecialtyUseCases(SqlAlchemySpecialtyRepository(db))
    use_case.delete(specialty_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
