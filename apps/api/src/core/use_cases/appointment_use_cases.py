from __future__ import annotations

from datetime import datetime
from uuid import UUID

from src.core.domain.entities import Appointment, AppointmentStatus
from src.core.domain.exceptions import ConflictError, NotFoundError, ValidationError
from src.core.ports.repositories import AppointmentRepository, DentistRepository, PatientRepository


class AppointmentUseCases:
    def __init__(
        self,
        appointment_repository: AppointmentRepository,
        patient_repository: PatientRepository,
        dentist_repository: DentistRepository,
    ) -> None:
        self.appointment_repository = appointment_repository
        self.patient_repository = patient_repository
        self.dentist_repository = dentist_repository

    def list(
        self,
        dt_from: datetime | None,
        dt_to: datetime | None,
        dentist_id: UUID | None,
        patient_id: UUID | None,
    ) -> list[Appointment]:
        return self.appointment_repository.list(dt_from, dt_to, dentist_id, patient_id)

    def get(self, appointment_id: UUID) -> Appointment:
        appointment = self.appointment_repository.get(appointment_id)
        if appointment is None:
            raise NotFoundError("Consulta não encontrada.")
        return appointment

    def create(self, data: dict) -> Appointment:
        self._validate_datetime(data["start_at"], data["end_at"])
        self._ensure_patient_and_dentist_exist(data["patient_id"], data["dentist_id"])

        status = AppointmentStatus(data.get("status", AppointmentStatus.scheduled.value))
        data["status"] = status

        if status != AppointmentStatus.cancelled and self.appointment_repository.has_conflict(
            dentist_id=data["dentist_id"],
            start_at=data["start_at"],
            end_at=data["end_at"],
        ):
            raise ConflictError(
                "Conflito de agenda: já existe consulta para este dentista no horário informado."
            )

        return self.appointment_repository.create(data)

    def update(self, appointment_id: UUID, data: dict) -> Appointment:
        current = self.appointment_repository.get(appointment_id)
        if current is None:
            raise NotFoundError("Consulta não encontrada.")

        merged = {
            "patient_id": data.get("patient_id", current.patient_id),
            "dentist_id": data.get("dentist_id", current.dentist_id),
            "start_at": data.get("start_at", current.start_at),
            "end_at": data.get("end_at", current.end_at),
            "status": data.get("status", current.status.value),
            "notes": data.get("notes", current.notes),
        }

        self._validate_datetime(merged["start_at"], merged["end_at"])
        self._ensure_patient_and_dentist_exist(merged["patient_id"], merged["dentist_id"])

        status = AppointmentStatus(merged["status"])
        merged["status"] = status

        if status != AppointmentStatus.cancelled and self.appointment_repository.has_conflict(
            dentist_id=merged["dentist_id"],
            start_at=merged["start_at"],
            end_at=merged["end_at"],
            exclude_appointment_id=appointment_id,
        ):
            raise ConflictError(
                "Conflito de agenda: já existe consulta para este dentista no horário informado."
            )

        updated = self.appointment_repository.update(appointment_id, merged)
        if updated is None:
            raise NotFoundError("Consulta não encontrada.")
        return updated

    def delete(self, appointment_id: UUID) -> None:
        deleted = self.appointment_repository.delete(appointment_id)
        if not deleted:
            raise NotFoundError("Consulta não encontrada.")

    def _validate_datetime(self, start_at: datetime, end_at: datetime) -> None:
        if end_at <= start_at:
            raise ValidationError("Horário final deve ser maior que o horário inicial.")

    def _ensure_patient_and_dentist_exist(self, patient_id: UUID, dentist_id: UUID) -> None:
        patient = self.patient_repository.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente não encontrado.")

        dentist = self.dentist_repository.get(dentist_id)
        if dentist is None:
            raise NotFoundError("Dentista não encontrado.")

