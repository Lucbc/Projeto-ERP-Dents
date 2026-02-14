from __future__ import annotations

from uuid import UUID

from src.core.domain.entities import Procedure
from src.core.domain.exceptions import NotFoundError, ValidationError
from src.core.ports.repositories import ProcedureRepository


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized if normalized else None


class ProcedureUseCases:
    def __init__(self, procedure_repository: ProcedureRepository) -> None:
        self.procedure_repository = procedure_repository

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Procedure], int]:
        return self.procedure_repository.list(search=search, limit=limit, offset=offset)

    def get(self, procedure_id: UUID) -> Procedure:
        procedure = self.procedure_repository.get(procedure_id)
        if procedure is None:
            raise NotFoundError("Procedimento nao encontrado.")
        return procedure

    def create(self, data: dict) -> Procedure:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValidationError("Nome do procedimento e obrigatorio.")

        data["name"] = name
        data["description"] = _normalize_text(data.get("description"))
        return self.procedure_repository.create(data)

    def update(self, procedure_id: UUID, data: dict) -> Procedure:
        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                raise ValidationError("Nome do procedimento e obrigatorio.")
            data["name"] = name

        if "description" in data:
            data["description"] = _normalize_text(data.get("description"))

        procedure = self.procedure_repository.update(procedure_id, data)
        if procedure is None:
            raise NotFoundError("Procedimento nao encontrado.")
        return procedure

    def delete(self, procedure_id: UUID) -> None:
        deleted = self.procedure_repository.delete(procedure_id)
        if not deleted:
            raise NotFoundError("Procedimento nao encontrado.")
