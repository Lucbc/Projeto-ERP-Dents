from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.adapters.db.repositories.dentist_repository import SqlAlchemyDentistRepository
from src.api.deps.auth import get_current_user
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    DentistCreateRequest,
    DentistListResponse,
    DentistResponse,
    DentistUpdateRequest,
)
from src.core.use_cases.dentist_use_cases import DentistUseCases

router = APIRouter(
    prefix="/api/dentists",
    tags=["dentists"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=DentistListResponse)
def list_dentists(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_dep),
) -> DentistListResponse:
    use_case = DentistUseCases(SqlAlchemyDentistRepository(db))
    items, total = use_case.list(search=search, limit=limit, offset=offset)
    return DentistListResponse(
        items=[DentistResponse.model_validate(item) for item in items],
        total=total,
    )


@router.post("", response_model=DentistResponse, status_code=status.HTTP_201_CREATED)
def create_dentist(payload: DentistCreateRequest, db: Session = Depends(get_db_dep)):
    use_case = DentistUseCases(SqlAlchemyDentistRepository(db))
    return use_case.create(payload.model_dump())


@router.get("/{dentist_id}", response_model=DentistResponse)
def get_dentist(dentist_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = DentistUseCases(SqlAlchemyDentistRepository(db))
    return use_case.get(dentist_id)


@router.put("/{dentist_id}", response_model=DentistResponse)
def update_dentist(
    dentist_id: UUID,
    payload: DentistUpdateRequest,
    db: Session = Depends(get_db_dep),
):
    use_case = DentistUseCases(SqlAlchemyDentistRepository(db))
    return use_case.update(dentist_id, payload.model_dump(exclude_unset=True))


@router.delete("/{dentist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dentist(dentist_id: UUID, db: Session = Depends(get_db_dep)) -> None:
    use_case = DentistUseCases(SqlAlchemyDentistRepository(db))
    use_case.delete(dentist_id)
