from __future__ import annotations

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.adapters.db.models.models import SpecialtyModel
from src.core.domain.entities import Specialty
from src.core.domain.exceptions import ConflictError, ValidationError
from src.core.ports.repositories import SpecialtyRepository


class SqlAlchemySpecialtyRepository(SpecialtyRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Specialty], int]:
        stmt = select(SpecialtyModel)

        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(or_(SpecialtyModel.name.ilike(pattern)))

        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.session.scalars(
            stmt.order_by(SpecialtyModel.name.asc()).limit(limit).offset(offset)
        ).all()
        return [self._to_entity(item) for item in items], int(total)

    def get(self, specialty_id):
        item = self.session.get(SpecialtyModel, specialty_id)
        return self._to_entity(item) if item else None

    def create(self, data: dict) -> Specialty:
        item = SpecialtyModel(**data)
        self.session.add(item)
        try:
            self.session.commit()
        except IntegrityError as error:
            self._raise_integrity(error)
        self.session.refresh(item)
        return self._to_entity(item)

    def update(self, specialty_id, data: dict):
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra o cadastro para obter a versão atual antes de salvar.")
        values = {key: data[key] for key in ("name", "active") if key in data}
        try:
            item = self.session.scalar(update(SpecialtyModel).where(
                SpecialtyModel.id == specialty_id, SpecialtyModel.version == version
            ).values(**values, version=SpecialtyModel.version + 1).returning(SpecialtyModel),
                execution_options={'populate_existing': True})
            if item is not None:
                self.session.commit()
        except IntegrityError as error:
            self._raise_integrity(error)
        if item is None:
            exists = self.session.scalar(select(SpecialtyModel.id).where(SpecialtyModel.id == specialty_id))
            self.session.rollback()
            if exists is None:
                return None
            raise ConflictError(
                "Esta especialidade foi alterada por outra operação. Seu rascunho foi mantido. Carregue o cadastro atual antes de salvar novamente.",
                code="stale_version")
        self.session.refresh(item)
        return self._to_entity(item)

    def _raise_integrity(self, error: IntegrityError):
        self.session.rollback()
        if (getattr(error.orig, 'sqlstate', None) == '23505'
                and getattr(getattr(error.orig, 'diag', None), 'constraint_name', None) == 'ix_specialties_name'):
            raise ConflictError("Já existe uma especialidade com este nome. Escolha outro nome para salvar.",
                code="specialty_name_exists") from error
        raise error

    def delete(self, specialty_id) -> bool:
        item = self.session.get(SpecialtyModel, specialty_id)
        if item is None:
            return False

        self.session.delete(item)
        self.session.commit()
        return True

    def _to_entity(self, model: SpecialtyModel) -> Specialty:
        return Specialty(
            version=model.version,
            id=model.id,
            name=model.name,
            active=model.active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
