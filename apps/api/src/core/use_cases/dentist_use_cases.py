from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import Dentist
from src.core.domain.exceptions import NotFoundError, ValidationError
from src.core.ports.repositories import DentistRepository


class DentistUseCases:
    def __init__(self, dentist_repository: DentistRepository) -> None:
        self.dentist_repository = dentist_repository

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Dentist], int]:
        return self.dentist_repository.list(search=search, limit=limit, offset=offset)

    def get(self, dentist_id: UUID) -> Dentist:
        dentist = self.dentist_repository.get(dentist_id)
        if dentist is None:
            raise NotFoundError("Dentista não encontrado.")
        return dentist

    def create(self, data: dict) -> Dentist:
        full_name = (data.get("full_name") or "").strip()
        if not full_name:
            raise ValidationError("Nome completo do dentista é obrigatório.")
        data["full_name"] = full_name
        return self.dentist_repository.create(data)

    def update(self, dentist_id: UUID, data: dict) -> Dentist:
        if "full_name" in data and not (data.get("full_name") or "").strip():
            raise ValidationError("Nome completo do dentista é obrigatório.")

        dentist = self.dentist_repository.update(dentist_id, data)
        if dentist is None:
            raise NotFoundError("Dentista não encontrado.")
        return dentist

    def delete(self, dentist_id: UUID) -> None:
        deleted = self.dentist_repository.delete(dentist_id)
        if not deleted:
            raise NotFoundError("Dentista não encontrado.")

