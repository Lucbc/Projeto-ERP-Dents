from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from src.adapters.db.models.models import (
    AppointmentModel,
    AppointmentProcedureModel,
    DentistModel,
    PatientModel,
)
from src.core.domain.entities import Appointment, AppointmentStatus
from src.core.ports.repositories import AppointmentRepository
from src.core.domain.availability import validate_booking, requires_booking_validation
from src.core.domain.exceptions import ConflictError, ValidationError, NotFoundError


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

    def _lock_dentists(self, ids):
        # SHARE (not KEY SHARE) prevents availability/active writes until commit.
        rows = self.session.scalars(select(DentistModel).where(DentistModel.id.in_(ids))
            .order_by(DentistModel.id).with_for_update(read=True)
            .execution_options(populate_existing=True)).all()
        by_id = {row.id: row for row in rows}
        if set(ids) != set(by_id):
            raise NotFoundError("Dentista nao encontrado.")
        return by_id

    def _validate_booking(self, dentist, values):
        try:
            validate_booking(dentist.active, dentist.availability, values['start_at'], values['end_at'])
        except ValidationError as error:
            raise ConflictError(
                "A disponibilidade do dentista não permite este agendamento. Seu rascunho foi mantido. Atualize os horários e revise antes de salvar.",
                code='availability_conflict') from error

    def create(self, data: dict) -> Appointment:
        try:
            values = dict(data)
            procedure_ids = values.pop('procedure_ids', [])
            dentists = self._lock_dentists([values['dentist_id']])
            if requires_booking_validation(None, values):
                self._validate_booking(dentists[values['dentist_id']], values)
            item = AppointmentModel(**values)
            item.procedure_links = [AppointmentProcedureModel(procedure_id=id) for id in procedure_ids]
            self.session.add(item)
            self.session.commit()
            self.session.refresh(item)
            return self._to_entity(item)
        except Exception:
            self.session.rollback()
            raise

    def update(self, appointment_id, data: dict):
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra a consulta para obter a versão atual antes de salvar.")
        try:
            # Preliminary scalar read avoids using an old ORM entity for lock selection.
            old_dentist = self.session.scalar(select(AppointmentModel.dentist_id).where(AppointmentModel.id == appointment_id))
            if old_dentist is None:
                self.session.rollback()
                return None
            target_dentist = data.get('dentist_id', old_dentist)
            dentists = self._lock_dentists(sorted({old_dentist, target_dentist}))
            item = self.session.scalar(select(AppointmentModel).where(AppointmentModel.id == appointment_id)
                .with_for_update().execution_options(populate_existing=True))
            if item is None:
                self.session.rollback()
                return None
            if item.version != version or item.dentist_id != old_dentist:
                raise ConflictError("Esta consulta foi alterada por outra operação. Seu rascunho foi mantido. Carregue a consulta atual antes de salvar novamente.", code='stale_version')
            values = {key: data.get(key, getattr(item, key)) for key in
                      ('patient_id', 'dentist_id', 'start_at', 'end_at', 'status', 'notes')}
            if requires_booking_validation(item, values):
                self._validate_booking(dentists[target_dentist], values)
            for key, value in values.items():
                setattr(item, key, value)
            item.version += 1
            if 'procedure_ids' in data:
                self.session.expire(item, ['procedure_links'])
                item.procedure_links = [AppointmentProcedureModel(procedure_id=id) for id in data['procedure_ids']]
            self.session.commit()
            self.session.refresh(item)
            return self._to_entity(item)
        except Exception:
            self.session.rollback()
            raise

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
