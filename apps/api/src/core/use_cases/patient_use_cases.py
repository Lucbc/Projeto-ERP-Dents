from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import Patient
from src.core.domain.exceptions import NotFoundError, ValidationError
from src.core.ports.repositories import PatientRepository


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
        return self.patient_repository.create(data)

    def update(self, patient_id: UUID, data: dict) -> Patient:
        if "full_name" in data and not (data.get("full_name") or "").strip():
            raise ValidationError("Nome completo do paciente é obrigatório.")

        patient = self.patient_repository.update(patient_id, data)
        if patient is None:
            raise NotFoundError("Paciente não encontrado.")
        return patient

    def delete(self, patient_id: UUID) -> None:
        deleted = self.patient_repository.delete(patient_id)
        if not deleted:
            raise NotFoundError("Paciente não encontrado.")

