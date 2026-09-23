from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, selectinload

from src.adapters.db.models.models import (
    AppointmentModel,
    AppointmentProcedureModel,
    DentistModel,
    PatientModel,
)
from src.core.domain.entities import Appointment, AppointmentStatus
from src.core.ports.repositories import AppointmentRepository
from src.core.domain.exceptions import ConflictError, ValidationError


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
            .options(selectinload(AppointmentModel.procedure_links))
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
        return [self._to_entity(row[0], patient_name=row[1], dentist_name=row[2]) for row in rows]

    def get(self, appointment_id):
        row = self.session.execute(
            select(AppointmentModel, PatientModel.full_name, DentistModel.full_name)
            .join(PatientModel, AppointmentModel.patient_id == PatientModel.id)
            .join(DentistModel, AppointmentModel.dentist_id == DentistModel.id)
            .where(AppointmentModel.id == appointment_id)
            .options(selectinload(AppointmentModel.procedure_links))
        ).first()

        if row is None:
            return None

        return self._to_entity(row[0], patient_name=row[1], dentist_name=row[2])

    def has_conflict(
        self,
        start_at: datetime,
        end_at: datetime,
        dentist_id: UUID | None = None,
        patient_id: UUID | None = None,
        exclude_appointment_id: UUID | None = None,
    ) -> bool:
        if dentist_id is None and patient_id is None:
            return False

        stmt = select(AppointmentModel.id).where(
            AppointmentModel.status != AppointmentStatus.cancelled,
            AppointmentModel.start_at < end_at,
            AppointmentModel.end_at > start_at,
        )

        if dentist_id is not None and patient_id is not None:
            stmt = stmt.where(
                or_(
                    AppointmentModel.dentist_id == dentist_id,
                    AppointmentModel.patient_id == patient_id,
                )
            )
        elif dentist_id is not None:
            stmt = stmt.where(AppointmentModel.dentist_id == dentist_id)
        elif patient_id is not None:
            stmt = stmt.where(AppointmentModel.patient_id == patient_id)

        if exclude_appointment_id is not None:
            stmt = stmt.where(AppointmentModel.id != exclude_appointment_id)

        return self.session.scalar(stmt.limit(1)) is not None

    def create(self, data: dict) -> Appointment:
        procedure_ids = data.pop("procedure_ids", [])
        item = AppointmentModel(**data)
        if procedure_ids:
            item.procedure_links = [
                AppointmentProcedureModel(procedure_id=procedure_id) for procedure_id in procedure_ids
            ]
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def update(self, appointment_id, data: dict):
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra a consulta para obter a versão atual antes de salvar.")
        values = {key: data[key] for key in ("patient_id", "dentist_id", "start_at", "end_at", "status", "notes") if key in data}
        # Acquire the row through a conditional write before touching procedure links.
        item = self.session.scalar(update(AppointmentModel).where(
            AppointmentModel.id == appointment_id, AppointmentModel.version == version
        ).values(**values, version=AppointmentModel.version + 1).returning(AppointmentModel),
            execution_options={'populate_existing': True})
        if item is None:
            exists = self.session.scalar(select(AppointmentModel.id).where(AppointmentModel.id == appointment_id))
            self.session.rollback()
            if exists is None:
                return None
            raise ConflictError("Esta consulta foi alterada por outra operação. Seu rascunho foi mantido. Carregue a consulta atual antes de salvar novamente.")

        if "procedure_ids" in data:
            self.session.expire(item, ['procedure_links'])
            item.procedure_links = [
                AppointmentProcedureModel(procedure_id=procedure_id) for procedure_id in data["procedure_ids"]
            ]

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, appointment_id: UUID, version: int) -> bool:
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra a consulta para obter a versão atual antes de excluir.")
        try:
            # Lock and refresh before ORM cascades can remove any procedure links.
            item = self.session.scalar(select(AppointmentModel).where(
                AppointmentModel.id == appointment_id
            ).with_for_update().execution_options(populate_existing=True))
            if item is None:
                self.session.rollback()
                return False
            if item.version != version:
                raise ConflictError(
                    "Esta consulta foi alterada. Carregue a consulta atual e confira os dados antes de confirmar outra exclusão.",
                    code="stale_version",
                )
            self.session.delete(item)
            self.session.commit()
            return True
        except Exception:
            self.session.rollback()
            raise

    def _to_entity(
        self,
        model: AppointmentModel,
        patient_name: str | None = None,
        dentist_name: str | None = None,
    ) -> Appointment:
        return Appointment(
            version=model.version,
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
            procedure_ids=[link.procedure_id for link in model.procedure_links],
        )
