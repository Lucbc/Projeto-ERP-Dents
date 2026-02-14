from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import Patient
from src.core.domain.exceptions import NotFoundError, ValidationError
from src.core.ports.repositories import PatientRepository


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized if normalized else None


class PatientUseCases:
    def __init__(self, patient_repository: PatientRepository) -> None:
        self.patient_repository = patient_repository

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Patient], int]:
        return self.patient_repository.list(search=search, limit=limit, offset=offset)

    def get(self, patient_id: UUID) -> Patient:
        patient = self.patient_repository.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente não encontrado.")
        return patient

    def create(self, data: dict) -> Patient:
        full_name = (data.get("full_name") or "").strip()
        if not full_name:
            raise ValidationError("Nome completo do paciente é obrigatório.")
        data["full_name"] = full_name
        data["preferred_name"] = _normalize_text(data.get("preferred_name"))
        data["cpf"] = _normalize_text(data.get("cpf"))
        data["rg"] = _normalize_text(data.get("rg"))
        data["phone"] = _normalize_text(data.get("phone"))
        data["email"] = _normalize_text(data.get("email"))
        data["address"] = _normalize_text(data.get("address"))
        data["preferred_contact_method"] = _normalize_text(data.get("preferred_contact_method"))
        data["emergency_contact_name"] = _normalize_text(data.get("emergency_contact_name"))
        data["emergency_contact_phone"] = _normalize_text(data.get("emergency_contact_phone"))
        data["insurance_provider"] = _normalize_text(data.get("insurance_provider"))
        data["insurance_plan"] = _normalize_text(data.get("insurance_plan"))
        data["insurance_member_id"] = _normalize_text(data.get("insurance_member_id"))
        data["allergies"] = _normalize_text(data.get("allergies"))
        data["medical_history"] = _normalize_text(data.get("medical_history"))
        data["notes"] = _normalize_text(data.get("notes"))
        data["active"] = bool(data.get("active", True))
        return self.patient_repository.create(data)

    def update(self, patient_id: UUID, data: dict) -> Patient:
        if "full_name" in data and not (data.get("full_name") or "").strip():
            raise ValidationError("Nome completo do paciente é obrigatório.")
        if "full_name" in data:
            data["full_name"] = (data.get("full_name") or "").strip()

        for field in [
            "preferred_name",
            "cpf",
            "rg",
            "phone",
            "email",
            "address",
            "preferred_contact_method",
            "emergency_contact_name",
            "emergency_contact_phone",
            "insurance_provider",
            "insurance_plan",
            "insurance_member_id",
            "allergies",
            "medical_history",
            "notes",
        ]:
            if field in data:
                data[field] = _normalize_text(data.get(field))

        patient = self.patient_repository.update(patient_id, data)
        if patient is None:
            raise NotFoundError("Paciente não encontrado.")
        return patient

    def delete(self, patient_id: UUID) -> None:
        deleted = self.patient_repository.delete(patient_id)
        if not deleted:
            raise NotFoundError("Paciente não encontrado.")

