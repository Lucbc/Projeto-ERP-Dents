from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.adapters.db.models.models import DentistModel
from src.core.domain.entities import Dentist
from src.core.ports.repositories import DentistRepository


class SqlAlchemyDentistRepository(DentistRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Dentist], int]:
        stmt = select(DentistModel)

        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    DentistModel.full_name.ilike(pattern),
                    DentistModel.cro.ilike(pattern),
                    DentistModel.email.ilike(pattern),
                )
            )

        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.session.scalars(
            stmt.order_by(DentistModel.created_at.desc()).limit(limit).offset(offset)
        ).all()
        return [self._to_entity(item) for item in items], int(total)

    def get(self, dentist_id):
        item = self.session.get(DentistModel, dentist_id)
        return self._to_entity(item) if item else None

    def create(self, data: dict) -> Dentist:
        item = DentistModel(**data)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def update(self, dentist_id, data: dict):
        item = self.session.get(DentistModel, dentist_id)
        if item is None:
            return None

        for key in ["full_name", "cro", "phone", "email", "active"]:
            if key in data:
                setattr(item, key, data[key])

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, dentist_id) -> bool:
        item = self.session.get(DentistModel, dentist_id)
        if item is None:
            return False

        self.session.delete(item)
        self.session.commit()
        return True

    def _to_entity(self, model: DentistModel) -> Dentist:
        return Dentist(
            id=model.id,
            full_name=model.full_name,
            cro=model.cro,
            phone=model.phone,
            email=model.email,
            active=model.active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
