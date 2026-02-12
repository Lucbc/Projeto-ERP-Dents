from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.adapters.db.repositories.appointment_repository import SqlAlchemyAppointmentRepository
from src.adapters.db.repositories.dentist_repository import SqlAlchemyDentistRepository
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.api.deps.auth import get_current_user
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    AppointmentCreateRequest,
    AppointmentResponse,
    AppointmentUpdateRequest,
)
from src.core.use_cases.appointment_use_cases import AppointmentUseCases

router = APIRouter(
    prefix="/api/appointments",
    tags=["appointments"],
    dependencies=[Depends(get_current_user)],
)


def build_use_case(db: Session) -> AppointmentUseCases:
    return AppointmentUseCases(
        appointment_repository=SqlAlchemyAppointmentRepository(db),
        patient_repository=SqlAlchemyPatientRepository(db),
        dentist_repository=SqlAlchemyDentistRepository(db),
    )


@router.get("", response_model=list[AppointmentResponse])
def list_appointments(
    dt_from: datetime | None = Query(default=None, alias="from"),
    dt_to: datetime | None = Query(default=None, alias="to"),
    dentist_id: UUID | None = None,
    patient_id: UUID | None = None,
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    return use_case.list(dt_from=dt_from, dt_to=dt_to, dentist_id=dentist_id, patient_id=patient_id)


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
def create_appointment(payload: AppointmentCreateRequest, db: Session = Depends(get_db_dep)):
    use_case = build_use_case(db)
    return use_case.create(payload.model_dump())


@router.get("/{appointment_id}", response_model=AppointmentResponse)
def get_appointment(appointment_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = build_use_case(db)
    return use_case.get(appointment_id)


@router.put("/{appointment_id}", response_model=AppointmentResponse)
def update_appointment(
    appointment_id: UUID,
    payload: AppointmentUpdateRequest,
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    return use_case.update(appointment_id, payload.model_dump(exclude_unset=True))


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(appointment_id: UUID, db: Session = Depends(get_db_dep)) -> None:
    use_case = build_use_case(db)
    use_case.delete(appointment_id)
