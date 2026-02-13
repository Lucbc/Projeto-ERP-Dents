from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.adapters.db.repositories.appointment_repository import SqlAlchemyAppointmentRepository
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.api.deps.auth import require_permission
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    AppointmentResponse,
    ConsultationPatientDetailResponse,
    ConsultationPatientListResponse,
    ConsultationPatientSummaryResponse,
    PatientResponse,
)
from src.core.domain.entities import User, UserRole
from src.core.domain.exceptions import ValidationError
from src.core.use_cases.consultation_use_cases import ConsultationUseCases

router = APIRouter(prefix="/api/consultations", tags=["consultations"])


def build_use_case(db: Session) -> ConsultationUseCases:
    return ConsultationUseCases(
        patient_repository=SqlAlchemyPatientRepository(db),
        appointment_repository=SqlAlchemyAppointmentRepository(db),
    )


def resolve_dentist_scope(current_user: User, dentist_id: UUID | None) -> UUID:
    if current_user.role == UserRole.dentist:
        if current_user.dentist_id is None:
            raise ValidationError("Usuário dentista sem vínculo de dentista associado.")
        return current_user.dentist_id

    if dentist_id is None:
        raise ValidationError("Informe o dentista para acessar o módulo de consulta.")
    return dentist_id


@router.get("/next", response_model=AppointmentResponse | None)
def get_next_consultation(
    dentist_id: UUID | None = None,
    current_user: User = Depends(require_permission("consultations", "view")),
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    scope_dentist_id = resolve_dentist_scope(current_user, dentist_id)
    appointment = use_case.get_next_appointment(scope_dentist_id)
    if appointment is None:
        return None
    return AppointmentResponse.model_validate(appointment)


@router.get("/patients", response_model=ConsultationPatientListResponse)
def list_consultation_patients(
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    dentist_id: UUID | None = None,
    current_user: User = Depends(require_permission("consultations", "view")),
    db: Session = Depends(get_db_dep),
) -> ConsultationPatientListResponse:
    use_case = build_use_case(db)
    scope_dentist_id = resolve_dentist_scope(current_user, dentist_id)
    patients, total = use_case.list_patients(search=search, limit=limit, offset=offset)
    next_by_patient = use_case.get_next_appointments_by_patient(scope_dentist_id)

    items = [
        ConsultationPatientSummaryResponse(
            patient=PatientResponse.model_validate(patient),
            next_appointment=(
                AppointmentResponse.model_validate(next_by_patient[patient.id])
                if patient.id in next_by_patient
                else None
            ),
        )
        for patient in patients
    ]

    return ConsultationPatientListResponse(items=items, total=total)


@router.get("/patients/{patient_id}", response_model=ConsultationPatientDetailResponse)
def get_consultation_patient_detail(
    patient_id: UUID,
    dentist_id: UUID | None = None,
    current_user: User = Depends(require_permission("consultations", "view")),
    db: Session = Depends(get_db_dep),
) -> ConsultationPatientDetailResponse:
    use_case = build_use_case(db)
    scope_dentist_id = resolve_dentist_scope(current_user, dentist_id)
    patient, next_appointment, upcoming = use_case.get_patient_detail(
        dentist_id=scope_dentist_id,
        patient_id=patient_id,
    )

    return ConsultationPatientDetailResponse(
        patient=PatientResponse.model_validate(patient),
        next_appointment=(
            AppointmentResponse.model_validate(next_appointment) if next_appointment is not None else None
        ),
        upcoming_appointments=[AppointmentResponse.model_validate(item) for item in upcoming],
    )
