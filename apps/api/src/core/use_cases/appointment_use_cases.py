from __future__ import annotations

from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from src.core.domain.entities import Appointment, AppointmentStatus, Dentist
from src.core.domain.exceptions import ConflictError, NotFoundError, ValidationError
from src.core.ports.repositories import (
    AppointmentRepository,
    DentistRepository,
    PatientRepository,
    ProcedureRepository,
)


class AppointmentUseCases:
    _CLINIC_TIMEZONE = ZoneInfo("America/Sao_Paulo")
    _WEEKDAY_LABELS = (
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    )

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
            self._validate_dentist_availability(dentist, data["start_at"], data["end_at"])
            self._validate_overlaps(
                dentist_id=data["dentist_id"],
                patient_id=data["patient_id"],
                start_at=data["start_at"],
                end_at=data["end_at"],
            )

        return self.appointment_repository.create(data)

    def update(self, appointment_id: UUID, data: dict) -> Appointment:
        current = self.appointment_repository.get(appointment_id)
        if current is None:
            raise NotFoundError("Consulta nao encontrada.")

        merged = {
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

        if status != AppointmentStatus.cancelled:
            self._validate_dentist_availability(dentist, merged["start_at"], merged["end_at"])
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

    def delete(self, appointment_id: UUID) -> None:
        deleted = self.appointment_repository.delete(appointment_id)
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
        if not dentist.active:
            raise ValidationError("Dentista inativo. Nao esta disponivel para agendamento.")

        start_local = self._to_clinic_timezone(start_at)
        end_local = self._to_clinic_timezone(end_at)

        if start_local.date() != end_local.date():
            raise ValidationError("Consulta deve iniciar e terminar no mesmo dia.")

        weekday_label = self._WEEKDAY_LABELS[start_local.weekday()]
        start_minutes = start_local.hour * 60 + start_local.minute
        end_minutes = end_local.hour * 60 + end_local.minute

        for raw_slot in dentist.availability or []:
            slot_day = str(raw_slot.get("day_of_week", "")).strip().lower()
            if slot_day != weekday_label:
                continue

            slot_start = self._parse_minutes(raw_slot.get("start_time"))
            slot_end = self._parse_minutes(raw_slot.get("end_time"))
            if slot_start is None or slot_end is None:
                continue

            if start_minutes >= slot_start and end_minutes <= slot_end:
                return

        raise ValidationError("Dentista nao possui disponibilidade na clinica para este dia/horario.")

    def _to_clinic_timezone(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=self._CLINIC_TIMEZONE)
        return value.astimezone(self._CLINIC_TIMEZONE)

    def _parse_minutes(self, value: object) -> int | None:
        if not isinstance(value, str) or ":" not in value:
            return None

        hour_part, minute_part = value.split(":", 1)
        if not hour_part.isdigit() or not minute_part.isdigit():
            return None

        hour = int(hour_part)
        minute = int(minute_part)
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            return None
        return hour * 60 + minute

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
