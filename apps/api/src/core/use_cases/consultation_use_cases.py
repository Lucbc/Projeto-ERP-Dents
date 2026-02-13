from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from src.core.domain.entities import Appointment, AppointmentStatus, Patient
from src.core.domain.exceptions import NotFoundError
from src.core.ports.repositories import AppointmentRepository, PatientRepository


class ConsultationUseCases:
    def __init__(self, patient_repository: PatientRepository, appointment_repository: AppointmentRepository) -> None:
        self.patient_repository = patient_repository
        self.appointment_repository = appointment_repository

    def get_next_appointment(self, dentist_id: UUID) -> Appointment | None:
        upcoming = self._list_upcoming_appointments(dentist_id=dentist_id, patient_id=None)
        return upcoming[0] if upcoming else None

    def list_patients(self, search: str | None, limit: int, offset: int) -> tuple[list[Patient], int]:
        return self.patient_repository.list(search=search, limit=limit, offset=offset)

    def get_next_appointments_by_patient(self, dentist_id: UUID) -> dict[UUID, Appointment]:
        upcoming = self._list_upcoming_appointments(dentist_id=dentist_id, patient_id=None)
        next_by_patient: dict[UUID, Appointment] = {}

        for appointment in upcoming:
            if appointment.patient_id not in next_by_patient:
                next_by_patient[appointment.patient_id] = appointment

        return next_by_patient

    def get_patient_detail(
        self,
        dentist_id: UUID,
        patient_id: UUID,
        upcoming_limit: int = 5,
    ) -> tuple[Patient, Appointment | None, list[Appointment]]:
        patient = self.patient_repository.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente não encontrado.")

        upcoming = self._list_upcoming_appointments(dentist_id=dentist_id, patient_id=patient_id)
        next_appointment = upcoming[0] if upcoming else None
        return patient, next_appointment, upcoming[:upcoming_limit]

    def _list_upcoming_appointments(self, dentist_id: UUID, patient_id: UUID | None) -> list[Appointment]:
        now = datetime.now(timezone.utc)
        appointments = self.appointment_repository.list(
            dt_from=now,
            dt_to=None,
            dentist_id=dentist_id,
            patient_id=patient_id,
        )
        return [item for item in appointments if item.status != AppointmentStatus.cancelled]
