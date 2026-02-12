from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.adapters.db.models.models import PatientModel
from src.core.domain.entities import Patient
from src.core.ports.repositories import PatientRepository


class SqlAlchemyPatientRepository(PatientRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Patient], int]:
        stmt = select(PatientModel)

        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    PatientModel.full_name.ilike(pattern),
                    PatientModel.cpf.ilike(pattern),
                    PatientModel.email.ilike(pattern),
                )
            )

        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.session.scalars(
            stmt.order_by(PatientModel.created_at.desc()).limit(limit).offset(offset)
        ).all()
        return [self._to_entity(item) for item in items], int(total)

    def get(self, patient_id):
        item = self.session.get(PatientModel, patient_id)
        return self._to_entity(item) if item else None

    def create(self, data: dict) -> Patient:
        item = PatientModel(**data)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def update(self, patient_id, data: dict):
        item = self.session.get(PatientModel, patient_id)
        if item is None:
            return None

        for key in ["full_name", "birth_date", "cpf", "phone", "email", "address", "notes"]:
            if key in data:
                setattr(item, key, data[key])

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, patient_id) -> bool:
        item = self.session.get(PatientModel, patient_id)
        if item is None:
            return False

        self.session.delete(item)
        self.session.commit()
        return True

    def _to_entity(self, model: PatientModel) -> Patient:
        return Patient(
            id=model.id,
            full_name=model.full_name,
            birth_date=model.birth_date,
            cpf=model.cpf,
            phone=model.phone,
            email=model.email,
            address=model.address,
            notes=model.notes,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
