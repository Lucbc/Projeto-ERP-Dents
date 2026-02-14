from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from src.adapters.db.repositories.procedure_repository import SqlAlchemyProcedureRepository
from src.api.deps.auth import require_permission
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    ProcedureCreateRequest,
    ProcedureListResponse,
    ProcedureResponse,
    ProcedureUpdateRequest,
)
from src.core.use_cases.procedure_use_cases import ProcedureUseCases

router = APIRouter(
    prefix="/api/procedures",
    tags=["procedures"],
)


@router.get(
    "",
    response_model=ProcedureListResponse,
    dependencies=[Depends(require_permission("procedures", "view"))],
)
def list_procedures(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_dep),
) -> ProcedureListResponse:
    use_case = ProcedureUseCases(SqlAlchemyProcedureRepository(db))
    items, total = use_case.list(search=search, limit=limit, offset=offset)
    return ProcedureListResponse(
        items=[ProcedureResponse.model_validate(item) for item in items],
        total=total,
    )


@router.post(
    "",
    response_model=ProcedureResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("procedures", "create"))],
)
def create_procedure(payload: ProcedureCreateRequest, db: Session = Depends(get_db_dep)):
    use_case = ProcedureUseCases(SqlAlchemyProcedureRepository(db))
    return use_case.create(payload.model_dump())


@router.get(
    "/{procedure_id}",
    response_model=ProcedureResponse,
    dependencies=[Depends(require_permission("procedures", "view"))],
)
def get_procedure(procedure_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = ProcedureUseCases(SqlAlchemyProcedureRepository(db))
    return use_case.get(procedure_id)


@router.put(
    "/{procedure_id}",
    response_model=ProcedureResponse,
    dependencies=[Depends(require_permission("procedures", "update"))],
)
def update_procedure(
    procedure_id: UUID,
    payload: ProcedureUpdateRequest,
    db: Session = Depends(get_db_dep),
):
    use_case = ProcedureUseCases(SqlAlchemyProcedureRepository(db))
    return use_case.update(procedure_id, payload.model_dump(exclude_unset=True))


@router.delete(
    "/{procedure_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_permission("procedures", "delete"))],
)
def delete_procedure(procedure_id: UUID, db: Session = Depends(get_db_dep)) -> Response:
    use_case = ProcedureUseCases(SqlAlchemyProcedureRepository(db))
    use_case.delete(procedure_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
