from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import Specialty
from src.core.domain.exceptions import NotFoundError, ValidationError
from src.core.ports.repositories import SpecialtyRepository


class SpecialtyUseCases:
    def __init__(self, specialty_repository: SpecialtyRepository) -> None:
        self.specialty_repository = specialty_repository

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Specialty], int]:
        return self.specialty_repository.list(search=search, limit=limit, offset=offset)

    def get(self, specialty_id: UUID) -> Specialty:
        specialty = self.specialty_repository.get(specialty_id)
        if specialty is None:
            raise NotFoundError("Especialidade nao encontrada.")
        return specialty

    def create(self, data: dict) -> Specialty:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValidationError("Nome da especialidade e obrigatorio.")
        data["name"] = name
        return self.specialty_repository.create(data)

    def update(self, specialty_id: UUID, data: dict) -> Specialty:
        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                raise ValidationError("Nome da especialidade e obrigatorio.")
            data["name"] = name

        specialty = self.specialty_repository.update(specialty_id, data)
        if specialty is None:
            raise NotFoundError("Especialidade nao encontrada.")
        return specialty

    def delete(self, specialty_id: UUID) -> None:
        deleted = self.specialty_repository.delete(specialty_id)
        if not deleted:
            raise NotFoundError("Especialidade nao encontrada.")
