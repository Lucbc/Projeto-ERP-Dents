from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.api.deps.auth import get_current_user
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
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=PatientListResponse)
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


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(payload: PatientCreateRequest, db: Session = Depends(get_db_dep)):
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    return use_case.create(payload.model_dump())


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    return use_case.get(patient_id)


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: UUID,
    payload: PatientUpdateRequest,
    db: Session = Depends(get_db_dep),
):
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    return use_case.update(patient_id, payload.model_dump(exclude_unset=True))


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(patient_id: UUID, db: Session = Depends(get_db_dep)) -> None:
    use_case = PatientUseCases(SqlAlchemyPatientRepository(db))
    use_case.delete(patient_id)
