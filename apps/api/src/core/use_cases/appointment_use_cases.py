from __future__ import annotations

from datetime import datetime
from uuid import UUID

from src.core.domain.entities import Appointment, AppointmentStatus, Dentist
from src.core.domain.availability import WEEKDAYS, validate_booking, requires_booking_validation
from src.core.domain.exceptions import ConflictError, NotFoundError, ValidationError
from src.core.ports.repositories import (
    AppointmentRepository,
    DentistRepository,
    PatientRepository,
    ProcedureRepository,
)


class AppointmentUseCases:
    _WEEKDAY_LABELS = WEEKDAYS

    def __init__(
        self,
        appointment_repository: AppointmentRepository,
        patient_repository: PatientRepository,
        dentist_repository: DentistRepository,
        procedure_repository: ProcedureRepository,
    ) -> None:
        self.appointment_repository = appointment_repository
        self.patient_repository = patient_repository
        self.dentist_repository = dentist_repository
        self.procedure_repository = procedure_repository

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
            raise NotFoundError("Consulta nao encontrada.")
        return appointment

    def create(self, data: dict) -> Appointment:
        self._validate_datetime(data["start_at"], data["end_at"])
        dentist = self._ensure_patient_and_dentist_exist(data["patient_id"], data["dentist_id"])
        data["procedure_ids"] = self._normalize_procedure_ids(data.get("procedure_ids"))

        status = AppointmentStatus(data.get("status", AppointmentStatus.scheduled.value))
        data["status"] = status

        if status != AppointmentStatus.cancelled:
            try:
                self._validate_dentist_availability(dentist, data["start_at"], data["end_at"])
            except ValidationError as error:
                raise ConflictError(str(error), code='availability_conflict') from error
            self._validate_overlaps(
                dentist_id=data["dentist_id"],
                patient_id=data["patient_id"],
                start_at=data["start_at"],
                end_at=data["end_at"],
            )

        return self.appointment_repository.create(data)

    def update(self, appointment_id: UUID, data: dict) -> Appointment:
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra a consulta para obter a versão atual antes de salvar.")
        current = self.appointment_repository.get(appointment_id)
        if current is None:
            raise NotFoundError("Consulta nao encontrada.")
        if current.version != version:
            raise ConflictError("Esta consulta foi alterada por outra operação. Seu rascunho foi mantido. Carregue a consulta atual antes de salvar novamente.")

        merged = {
            "version": version,
            "patient_id": data.get("patient_id", current.patient_id),
            "dentist_id": data.get("dentist_id", current.dentist_id),
            "procedure_ids": data.get("procedure_ids", current.procedure_ids),
            "start_at": data.get("start_at", current.start_at),
            "end_at": data.get("end_at", current.end_at),
            "status": data.get("status", current.status.value),
            "notes": data.get("notes", current.notes),
        }

        self._validate_datetime(merged["start_at"], merged["end_at"])
        dentist = self._ensure_patient_and_dentist_exist(merged["patient_id"], merged["dentist_id"])
        merged["procedure_ids"] = self._normalize_procedure_ids(merged.get("procedure_ids"))

        status = AppointmentStatus(merged["status"])
        merged["status"] = status

        if requires_booking_validation(current, merged):
            try:
                self._validate_dentist_availability(dentist, merged["start_at"], merged["end_at"])
            except ValidationError as error:
                raise ConflictError(str(error), code='availability_conflict') from error
        if status != AppointmentStatus.cancelled:
            self._validate_overlaps(
                dentist_id=merged["dentist_id"],
                patient_id=merged["patient_id"],
                start_at=merged["start_at"],
                end_at=merged["end_at"],
                exclude_appointment_id=appointment_id,
            )

        updated = self.appointment_repository.update(appointment_id, merged)
        if updated is None:
            raise NotFoundError("Consulta nao encontrada.")
        return updated

    def delete(self, appointment_id: UUID, version: int) -> None:
        deleted = self.appointment_repository.delete(appointment_id, version)
        if not deleted:
            raise NotFoundError("Consulta nao encontrada.")

    def _validate_datetime(self, start_at: datetime, end_at: datetime) -> None:
        if end_at <= start_at:
            raise ValidationError("Horario final deve ser maior que o horario inicial.")

    def _ensure_patient_and_dentist_exist(self, patient_id: UUID, dentist_id: UUID) -> Dentist:
        patient = self.patient_repository.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente nao encontrado.")

        dentist = self.dentist_repository.get(dentist_id)
        if dentist is None:
            raise NotFoundError("Dentista nao encontrado.")
        return dentist

    def _validate_dentist_availability(
        self,
        dentist: Dentist,
        start_at: datetime,
        end_at: datetime,
    ) -> None:
        validate_booking(dentist.active, dentist.availability, start_at, end_at)

    def _validate_overlaps(
        self,
        dentist_id: UUID,
        patient_id: UUID,
        start_at: datetime,
        end_at: datetime,
        exclude_appointment_id: UUID | None = None,
    ) -> None:
        if self.appointment_repository.has_conflict(
            start_at=start_at,
            end_at=end_at,
            dentist_id=dentist_id,
            exclude_appointment_id=exclude_appointment_id,
        ):
            raise ConflictError("Conflito de agenda: ja existe consulta para este dentista no horario informado.")

        if self.appointment_repository.has_conflict(
            start_at=start_at,
            end_at=end_at,
            patient_id=patient_id,
            exclude_appointment_id=exclude_appointment_id,
        ):
            raise ConflictError("Conflito de agenda: este paciente ja possui consulta no horario informado.")

    def _normalize_procedure_ids(self, procedure_ids: object) -> list[UUID]:
        if procedure_ids is None:
            return []
        if not isinstance(procedure_ids, list):
            raise ValidationError("Procedimentos da consulta devem ser informados em lista.")

        normalized: list[UUID] = []
        seen: set[UUID] = set()
        for raw_id in procedure_ids:
            try:
                procedure_id = raw_id if isinstance(raw_id, UUID) else UUID(str(raw_id))
            except (TypeError, ValueError):
                raise ValidationError("ID de procedimento invalido.") from None

            if procedure_id in seen:
                continue
            seen.add(procedure_id)
            normalized.append(procedure_id)

        for procedure_id in normalized:
            procedure = self.procedure_repository.get(procedure_id)
            if procedure is None:
                raise NotFoundError("Procedimento nao encontrado.")

        return normalized
