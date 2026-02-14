from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.adapters.db.models.models import ProcedureModel
from src.core.domain.entities import Procedure
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
        item = self.session.get(ProcedureModel, procedure_id)
        if item is None:
            return None

        for key in ["name", "description", "duration_minutes", "price_cents", "active"]:
            if key in data:
                setattr(item, key, data[key])

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, procedure_id) -> bool:
        item = self.session.get(ProcedureModel, procedure_id)
        if item is None:
            return False

        self.session.delete(item)
        self.session.commit()
        return True

    def _to_entity(self, model: ProcedureModel) -> Procedure:
        return Procedure(
            id=model.id,
            name=model.name,
            description=model.description,
            duration_minutes=model.duration_minutes,
            price_cents=model.price_cents,
            active=model.active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
