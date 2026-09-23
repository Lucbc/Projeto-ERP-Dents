from __future__ import annotations

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session
from .catalog_deletion import delete_catalog_record

from src.adapters.db.models.models import ProcedureModel
from src.core.domain.entities import Procedure
from src.core.domain.exceptions import ConflictError, ValidationError
from src.core.ports.repositories import ProcedureRepository


class SqlAlchemyProcedureRepository(ProcedureRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Procedure], int]:
        stmt = select(ProcedureModel)

        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    ProcedureModel.name.ilike(pattern),
                    ProcedureModel.description.ilike(pattern),
                )
            )

        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.session.scalars(
            stmt.order_by(ProcedureModel.created_at.desc()).limit(limit).offset(offset)
        ).all()
        return [self._to_entity(item) for item in items], int(total)

    def get(self, procedure_id):
        item = self.session.get(ProcedureModel, procedure_id)
        return self._to_entity(item) if item else None

    def create(self, data: dict) -> Procedure:
        item = ProcedureModel(**data)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def update(self, procedure_id, data: dict):
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra o cadastro para obter a versão atual antes de salvar.")
        values = {key: data[key] for key in (
            "name", "description", "duration_minutes", "price_cents", "active"
        ) if key in data}
        item = self.session.scalar(update(ProcedureModel).where(
            ProcedureModel.id == procedure_id, ProcedureModel.version == version
        ).values(**values, version=ProcedureModel.version + 1).returning(ProcedureModel),
            execution_options={'populate_existing': True})
        if item is None:
            exists = self.session.scalar(select(ProcedureModel.id).where(ProcedureModel.id == procedure_id))
            self.session.rollback()
            if exists is None:
                return None
            raise ConflictError("Este procedimento foi alterado por outra operação. Seu rascunho foi mantido. Carregue o cadastro atual antes de salvar novamente.")

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, procedure_id, version: int) -> bool:
        return delete_catalog_record(self.session, ProcedureModel, procedure_id, version)

    def _to_entity(self, model: ProcedureModel) -> Procedure:
        return Procedure(
            version=model.version,
            id=model.id,
            name=model.name,
            description=model.description,
            duration_minutes=model.duration_minutes,
            price_cents=model.price_cents,
            active=model.active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
