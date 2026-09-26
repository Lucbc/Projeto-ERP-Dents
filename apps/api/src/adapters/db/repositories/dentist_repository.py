from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.adapters.db.models.models import DentistModel, AppointmentModel
from src.adapters.db.repositories.catalog_deletion import delete_catalog_record
from src.core.domain.entities import Dentist, AppointmentStatus
from src.core.domain.availability import validate_booking, same_availability
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

    def _now(self):
        return datetime.now(timezone.utc)

    def _validate_existing_bookings(self, item, values):
        active = values.get('active', item.active)
        availability = values.get('availability', item.availability)
        if active == item.active and same_availability(availability, item.availability):
            return
        # The exclusive dentist lock prevents new/changed reservations. Read after
        # acquiring it so a writer that committed first is visible under READ COMMITTED.
        bookings = self.session.execute(select(AppointmentModel.start_at, AppointmentModel.end_at).where(
            AppointmentModel.dentist_id == item.id,
            AppointmentModel.status.in_([AppointmentStatus.scheduled, AppointmentStatus.confirmed]),
            AppointmentModel.end_at > self._now(),
        ))
        for start, end in bookings:
            try:
                validate_booking(active, availability, start, end)
            except ValidationError as error:
                raise ConflictError(
                    "Existem consultas em andamento ou futuras incompatíveis com esta alteração. Reagende ou cancele as consultas afetadas antes de alterar os horários ou inativar o dentista.",
                    code='availability_conflict') from error

    def update(self, dentist_id, data: dict):
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra o cadastro para obter a versão atual antes de salvar.")
        try:
            item = self.session.scalar(select(DentistModel).where(DentistModel.id == dentist_id)
                .with_for_update().execution_options(populate_existing=True))
            if item is None:
                self.session.rollback()
                return None
            if item.version != version:
                raise ConflictError("Este dentista foi alterado por outra operação. Seu rascunho foi mantido. Carregue o cadastro atual antes de salvar novamente.", code='stale_version')
            values = {key: data[key] for key in (
                'full_name', 'cro', 'phone', 'email', 'specialty', 'color', 'availability', 'active'
            ) if key in data}
            self._validate_existing_bookings(item, values)
            for key, value in values.items():
                setattr(item, key, value)
            item.version += 1
            self.session.commit()
            self.session.refresh(item)
            return self._to_entity(item)
        except Exception:
            self.session.rollback()
            raise

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
