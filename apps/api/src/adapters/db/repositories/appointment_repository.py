from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.adapters.db.models.models import AppointmentModel, DentistModel, PatientModel
from src.core.domain.entities import Appointment, AppointmentStatus
from src.core.ports.repositories import AppointmentRepository


class SqlAlchemyAppointmentRepository(AppointmentRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(
        self,
        dt_from: datetime | None,
        dt_to: datetime | None,
        dentist_id: UUID | None,
        patient_id: UUID | None,
    ) -> list[Appointment]:
        stmt = (
            select(AppointmentModel, PatientModel.full_name, DentistModel.full_name)
            .join(PatientModel, AppointmentModel.patient_id == PatientModel.id)
            .join(DentistModel, AppointmentModel.dentist_id == DentistModel.id)
        )

        if dt_from is not None:
            stmt = stmt.where(AppointmentModel.start_at >= dt_from)
        if dt_to is not None:
            stmt = stmt.where(AppointmentModel.start_at <= dt_to)
        if dentist_id is not None:
            stmt = stmt.where(AppointmentModel.dentist_id == dentist_id)
        if patient_id is not None:
            stmt = stmt.where(AppointmentModel.patient_id == patient_id)

        rows = self.session.execute(stmt.order_by(AppointmentModel.start_at.asc())).all()
        return [
            self._to_entity(row[0], patient_name=row[1], dentist_name=row[2])
            for row in rows
        ]

    def get(self, appointment_id):
        row = self.session.execute(
            select(AppointmentModel, PatientModel.full_name, DentistModel.full_name)
            .join(PatientModel, AppointmentModel.patient_id == PatientModel.id)
            .join(DentistModel, AppointmentModel.dentist_id == DentistModel.id)
            .where(AppointmentModel.id == appointment_id)
        ).first()

        if row is None:
            return None

        return self._to_entity(row[0], patient_name=row[1], dentist_name=row[2])

    def has_conflict(
        self,
        dentist_id: UUID,
        start_at: datetime,
        end_at: datetime,
        exclude_appointment_id: UUID | None = None,
    ) -> bool:
        stmt = select(AppointmentModel.id).where(
            AppointmentModel.dentist_id == dentist_id,
            AppointmentModel.status != AppointmentStatus.cancelled,
            AppointmentModel.start_at < end_at,
            AppointmentModel.end_at > start_at,
        )

        if exclude_appointment_id is not None:
            stmt = stmt.where(AppointmentModel.id != exclude_appointment_id)

        return self.session.scalar(stmt.limit(1)) is not None

    def create(self, data: dict) -> Appointment:
        item = AppointmentModel(**data)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def update(self, appointment_id, data: dict):
        item = self.session.get(AppointmentModel, appointment_id)
        if item is None:
            return None

        for key in ["patient_id", "dentist_id", "start_at", "end_at", "status", "notes"]:
            if key in data:
                setattr(item, key, data[key])

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, appointment_id) -> bool:
        item = self.session.get(AppointmentModel, appointment_id)
        if item is None:
            return False

        self.session.delete(item)
        self.session.commit()
        return True

    def _to_entity(
        self,
        model: AppointmentModel,
        patient_name: str | None = None,
        dentist_name: str | None = None,
    ) -> Appointment:
        return Appointment(
            id=model.id,
            patient_id=model.patient_id,
            dentist_id=model.dentist_id,
            start_at=model.start_at,
            end_at=model.end_at,
            status=model.status,
            notes=model.notes,
            created_at=model.created_at,
            updated_at=model.updated_at,
            patient_name=patient_name,
            dentist_name=dentist_name,
        )
