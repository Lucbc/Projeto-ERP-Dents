from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.api.deps.auth import require_permission
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    PatientCreateRequest,
    PatientListResponse,
    PatientResponse,
    PatientUpdateRequest,
)
from src.core.use_cases.patient_use_cases import PatientUseCases

router = APIRouter(
    prefix="/api/patients",
    tags=["patients"],
)


@router.get(
    "",
    response_model=PatientListResponse,
    dependencies=[Depends(require_permission("patients", "view"))],
)
def list_patients(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_dep),
) -> PatientListResponse:
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    items, total = use_case.list(search=search, limit=limit, offset=offset)
    return PatientListResponse(
        items=[PatientResponse.model_validate(item) for item in items],
        total=total,
    )


@router.post(
    "",
    response_model=PatientResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("patients", "create"))],
)
def create_patient(payload: PatientCreateRequest, db: Session = Depends(get_db_dep)):
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    return use_case.create(payload.model_dump())


@router.get(
    "/{patient_id}",
    response_model=PatientResponse,
    dependencies=[Depends(require_permission("patients", "view"))],
)
def get_patient(patient_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    return use_case.get(patient_id)


@router.put(
    "/{patient_id}",
    response_model=PatientResponse,
    dependencies=[Depends(require_permission("patients", "update"))],
)
def update_patient(
    patient_id: UUID,
    payload: PatientUpdateRequest,
    db: Session = Depends(get_db_dep),
):
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    return use_case.update(patient_id, payload.model_dump(exclude_unset=True))


@router.delete(
    "/{patient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_permission("patients", "delete"))],
)
def delete_patient(patient_id: UUID, db: Session = Depends(get_db_dep)) -> Response:
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    use_case.delete(patient_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
