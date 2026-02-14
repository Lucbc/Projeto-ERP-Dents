from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID

from src.core.domain.entities import (
    FinancialEntry,
    FinancialEntryStatus,
    FinancialEntryType,
    FinancialSummary,
    PaymentMethod,
)
from src.core.domain.exceptions import ConflictError, NotFoundError, ValidationError
from src.core.ports.repositories import (
    AppointmentRepository,
    DentistRepository,
    FinancialRepository,
    PatientRepository,
    ProcedureRepository,
)


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized if normalized else None


def _to_utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FinancialUseCases:
    def __init__(
        self,
        financial_repository: FinancialRepository,
        appointment_repository: AppointmentRepository,
        patient_repository: PatientRepository,
        dentist_repository: DentistRepository,
        procedure_repository: ProcedureRepository,
    ) -> None:
        self.financial_repository = financial_repository
        self.appointment_repository = appointment_repository
        self.patient_repository = patient_repository
        self.dentist_repository = dentist_repository
        self.procedure_repository = procedure_repository

    def list(
        self,
        search: str | None,
        entry_type: str | None,
        status: str | None,
        dt_from: date | None,
        dt_to: date | None,
        patient_id: UUID | None,
        dentist_id: UUID | None,
        appointment_id: UUID | None,
        limit: int,
        offset: int,
    ) -> tuple[list[FinancialEntry], int]:
        normalized_type = self._normalize_entry_type(entry_type) if entry_type else None
        normalized_status = self._normalize_status(status) if status else None

        return self.financial_repository.list(
            search=search,
            entry_type=normalized_type.value if normalized_type else None,
            status=normalized_status.value if normalized_status else None,
            dt_from=dt_from,
            dt_to=dt_to,
            patient_id=patient_id,
            dentist_id=dentist_id,
            appointment_id=appointment_id,
            limit=limit,
            offset=offset,
        )

    def summarize(self, dt_from: date | None, dt_to: date | None) -> FinancialSummary:
        return self.financial_repository.summarize(dt_from=dt_from, dt_to=dt_to)

    def get(self, financial_entry_id: UUID) -> FinancialEntry:
        financial_entry = self.financial_repository.get(financial_entry_id)
        if financial_entry is None:
            raise NotFoundError("Lancamento financeiro nao encontrado.")
        return financial_entry

    def create(self, data: dict) -> FinancialEntry:
        normalized = self._normalize_input(data)
        return self.financial_repository.create(normalized)

    def update(self, financial_entry_id: UUID, data: dict) -> FinancialEntry:
        current = self.financial_repository.get(financial_entry_id)
        if current is None:
            raise NotFoundError("Lancamento financeiro nao encontrado.")

        merged = {
            "entry_type": data.get("entry_type", current.entry_type.value),
            "description": data.get("description", current.description),
            "amount_cents": data.get("amount_cents", current.amount_cents),
            "discount_cents": data.get("discount_cents", current.discount_cents),
            "tax_cents": data.get("tax_cents", current.tax_cents),
            "due_date": data.get("due_date", current.due_date),
            "paid_at": data.get("paid_at", current.paid_at),
            "status": data.get("status", current.status.value),
            "payment_method": data.get("payment_method", current.payment_method.value if current.payment_method else None),
            "patient_id": data.get("patient_id", current.patient_id),
            "dentist_id": data.get("dentist_id", current.dentist_id),
            "appointment_id": data.get("appointment_id", current.appointment_id),
            "procedure_ids": data.get("procedure_ids", current.procedure_ids),
            "notes": data.get("notes", current.notes),
        }

        normalized = self._normalize_input(merged, current_id=financial_entry_id)
        updated = self.financial_repository.update(financial_entry_id, normalized)
        if updated is None:
            raise NotFoundError("Lancamento financeiro nao encontrado.")
        return updated

    def mark_as_paid(
        self,
        financial_entry_id: UUID,
        paid_at: datetime | None = None,
        payment_method: PaymentMethod | None = None,
    ) -> FinancialEntry:
        current = self.financial_repository.get(financial_entry_id)
        if current is None:
            raise NotFoundError("Lancamento financeiro nao encontrado.")
        if current.status == FinancialEntryStatus.cancelled:
            raise ValidationError("Nao e possivel dar baixa em lancamento cancelado.")

        payload = {
            "status": FinancialEntryStatus.paid.value,
            "paid_at": paid_at or _to_utc_now(),
        }
        if payment_method is not None:
            payload["payment_method"] = payment_method.value

        updated = self.financial_repository.update(financial_entry_id, payload)
        if updated is None:
            raise NotFoundError("Lancamento financeiro nao encontrado.")
        return updated

    def delete(self, financial_entry_id: UUID) -> None:
        deleted = self.financial_repository.delete(financial_entry_id)
        if not deleted:
            raise NotFoundError("Lancamento financeiro nao encontrado.")

    def generate_from_appointment(self, appointment_id: UUID, data: dict) -> FinancialEntry:
        appointment = self.appointment_repository.get(appointment_id)
        if appointment is None:
            raise NotFoundError("Consulta nao encontrada.")

        existing = self.financial_repository.get_by_appointment(appointment_id)
        if existing is not None:
            raise ConflictError("Esta consulta ja possui lancamento financeiro vinculado.")

        if not appointment.procedure_ids:
            raise ValidationError("A consulta nao possui procedimentos vinculados.")

        amount_cents = 0
        for procedure_id in appointment.procedure_ids:
            procedure = self.procedure_repository.get(procedure_id)
            if procedure is None:
                raise NotFoundError("Procedimento nao encontrado.")
            if procedure.price_cents:
                amount_cents += procedure.price_cents

        if amount_cents <= 0:
            raise ValidationError("Os procedimentos da consulta nao possuem preco cadastrado.")

        payload = {
            "entry_type": FinancialEntryType.income.value,
            "description": (
                f"Consulta - {appointment.patient_name or 'Paciente'} - "
                f"{appointment.start_at.strftime('%d/%m/%Y %H:%M')}"
            ),
            "amount_cents": amount_cents,
            "discount_cents": 0,
            "tax_cents": 0,
            "due_date": data.get("due_date") or appointment.start_at.date(),
            "paid_at": data.get("paid_at"),
            "status": data.get("status", FinancialEntryStatus.pending.value),
            "payment_method": data.get("payment_method"),
            "patient_id": appointment.patient_id,
            "dentist_id": appointment.dentist_id,
            "appointment_id": appointment.id,
            "procedure_ids": appointment.procedure_ids,
            "notes": data.get("notes"),
        }

        normalized = self._normalize_input(payload)
        return self.financial_repository.create(normalized)

    def _normalize_input(self, data: dict, current_id: UUID | None = None) -> dict:
        normalized: dict = {}

        entry_type = self._normalize_entry_type(data.get("entry_type"))
        status = self._normalize_status(data.get("status", FinancialEntryStatus.pending.value))
        payment_method = self._normalize_payment_method(data.get("payment_method"))

        description = (data.get("description") or "").strip()
        if not description:
            raise ValidationError("Descricao do lancamento e obrigatoria.")

        amount_cents = self._to_non_negative_int(data.get("amount_cents"), field_label="Valor base")
        discount_cents = self._to_non_negative_int(data.get("discount_cents", 0), field_label="Desconto")
        tax_cents = self._to_non_negative_int(data.get("tax_cents", 0), field_label="Acrescimo")
        total_cents = amount_cents - discount_cents + tax_cents
        if total_cents < 0:
            raise ValidationError("Total do lancamento nao pode ser negativo.")

        due_date = data.get("due_date")
        if not isinstance(due_date, date):
            raise ValidationError("Data de vencimento invalida.")

        paid_at = data.get("paid_at")
        if status == FinancialEntryStatus.paid:
            if paid_at is None:
                paid_at = _to_utc_now()
            elif not isinstance(paid_at, datetime):
                raise ValidationError("Data de pagamento invalida.")
        else:
            paid_at = None

        patient_id = self._normalize_optional_uuid(data.get("patient_id"))
        dentist_id = self._normalize_optional_uuid(data.get("dentist_id"))
        appointment_id = self._normalize_optional_uuid(data.get("appointment_id"))
        procedure_ids = self._normalize_procedure_ids(data.get("procedure_ids"))

        if patient_id is not None and self.patient_repository.get(patient_id) is None:
            raise NotFoundError("Paciente nao encontrado.")
        if dentist_id is not None and self.dentist_repository.get(dentist_id) is None:
            raise NotFoundError("Dentista nao encontrado.")

        if appointment_id is not None:
            appointment = self.appointment_repository.get(appointment_id)
            if appointment is None:
                raise NotFoundError("Consulta nao encontrada.")

            if patient_id is None:
                patient_id = appointment.patient_id
            elif patient_id != appointment.patient_id:
                raise ValidationError("Paciente informado difere do paciente vinculado a consulta.")

            if dentist_id is None:
                dentist_id = appointment.dentist_id
            elif dentist_id != appointment.dentist_id:
                raise ValidationError("Dentista informado difere do dentista vinculado a consulta.")

            if not procedure_ids:
                procedure_ids = list(appointment.procedure_ids)

            existing = self.financial_repository.get_by_appointment(appointment_id)
            if existing is not None and existing.id != current_id:
                raise ConflictError("A consulta ja possui um lancamento financeiro ativo.")

        normalized["entry_type"] = entry_type
        normalized["description"] = description
        normalized["amount_cents"] = amount_cents
        normalized["discount_cents"] = discount_cents
        normalized["tax_cents"] = tax_cents
        normalized["total_cents"] = total_cents
        normalized["due_date"] = due_date
        normalized["paid_at"] = paid_at
        normalized["status"] = status
        normalized["payment_method"] = payment_method
        normalized["patient_id"] = patient_id
        normalized["dentist_id"] = dentist_id
        normalized["appointment_id"] = appointment_id
        normalized["procedure_ids"] = [str(procedure_id) for procedure_id in procedure_ids]
        normalized["notes"] = _normalize_text(data.get("notes"))

        return normalized

    def _normalize_entry_type(self, value: object) -> FinancialEntryType:
        try:
            return value if isinstance(value, FinancialEntryType) else FinancialEntryType(str(value))
        except ValueError as exc:
            raise ValidationError("Tipo de lancamento invalido.") from exc

    def _normalize_status(self, value: object) -> FinancialEntryStatus:
        try:
            return value if isinstance(value, FinancialEntryStatus) else FinancialEntryStatus(str(value))
        except ValueError as exc:
            raise ValidationError("Status financeiro invalido.") from exc

    def _normalize_payment_method(self, value: object) -> PaymentMethod | None:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        try:
            return value if isinstance(value, PaymentMethod) else PaymentMethod(str(value))
        except ValueError as exc:
            raise ValidationError("Forma de pagamento invalida.") from exc

    def _to_non_negative_int(self, value: object, field_label: str) -> int:
        try:
            normalized = int(value)
        except (TypeError, ValueError) as exc:
            raise ValidationError(f"{field_label} invalido.") from exc

        if normalized < 0:
            raise ValidationError(f"{field_label} nao pode ser negativo.")
        return normalized

    def _normalize_optional_uuid(self, value: object) -> UUID | None:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        try:
            return value if isinstance(value, UUID) else UUID(str(value))
        except (TypeError, ValueError) as exc:
            raise ValidationError("ID invalido.") from exc

    def _normalize_procedure_ids(self, value: object) -> list[UUID]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValidationError("Procedimentos devem ser informados em lista.")

        normalized: list[UUID] = []
        seen: set[UUID] = set()
        for raw_id in value:
            try:
                procedure_id = raw_id if isinstance(raw_id, UUID) else UUID(str(raw_id))
            except (TypeError, ValueError) as exc:
                raise ValidationError("ID de procedimento invalido.") from exc

            if procedure_id in seen:
                continue
            seen.add(procedure_id)
            normalized.append(procedure_id)

        for procedure_id in normalized:
            if self.procedure_repository.get(procedure_id) is None:
                raise NotFoundError("Procedimento nao encontrado.")

        return normalized
