from __future__ import annotations

from copy import deepcopy

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from src.adapters.db.models.models import DentistModel
from src.adapters.db.repositories.catalog_deletion import delete_catalog_record
from src.core.domain.entities import Dentist
from src.core.ports.repositories import DentistRepository
from src.core.domain.exceptions import ConflictError, ValidationError


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
                    DentistModel.specialty.ilike(pattern),
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
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra o cadastro para obter a versão atual antes de salvar.")
        values = {key: data[key] for key in (
            "full_name", "cro", "phone", "email", "specialty", "color", "availability", "active"
        ) if key in data}
        item = self.session.scalar(update(DentistModel).where(
            DentistModel.id == dentist_id, DentistModel.version == version
        ).values(**values, version=DentistModel.version + 1).returning(DentistModel),
            execution_options={'populate_existing': True})
        if item is None:
            exists = self.session.scalar(select(DentistModel.id).where(DentistModel.id == dentist_id))
            self.session.rollback()
            if exists is None:
                return None
            raise ConflictError("Este dentista foi alterado por outra operação. Seu rascunho foi mantido. Carregue o cadastro atual antes de salvar novamente.")

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, dentist_id, version: int) -> bool:
        return delete_catalog_record(self.session, DentistModel, dentist_id, version)

    def _to_entity(self, model: DentistModel) -> Dentist:
        return Dentist(
            version=model.version,
            id=model.id,
            full_name=model.full_name,
            cro=model.cro,
            phone=model.phone,
            email=model.email,
            specialty=model.specialty,
            color=model.color,
            availability=deepcopy(model.availability or []),
            active=model.active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
