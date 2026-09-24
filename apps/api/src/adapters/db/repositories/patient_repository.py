from __future__ import annotations

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from src.adapters.db.models.models import PatientModel, ExamModel
from src.adapters.db.exam_cleanup import queue_exam_file
from sqlalchemy.exc import IntegrityError
from src.core.domain.exceptions import ConflictError, ValidationError, ForbiddenError
from src.adapters.db.repositories.patient_deletion import exams_fingerprint
import re
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
                    PatientModel.rg.ilike(pattern),
                    PatientModel.phone.ilike(pattern),
                    PatientModel.email.ilike(pattern),
                    PatientModel.insurance_provider.ilike(pattern),
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
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra o cadastro para obter a versão atual antes de salvar.")
        values = {}
        for key in [
            "full_name",
            "preferred_name",
            "birth_date",
            "cpf",
            "rg",
            "phone",
            "email",
            "address",
            "preferred_contact_method",
            "emergency_contact_name",
            "emergency_contact_phone",
            "insurance_provider",
            "insurance_plan",
            "insurance_member_id",
            "allergies",
            "medical_history",
            "notes",
            "active",
        ]:
            if key in data:
                values[key] = data[key]

        # The predicate and increment are one SQL statement, including no-op edits.
        item = self.session.scalar(update(PatientModel).where(
            PatientModel.id == patient_id, PatientModel.version == version
        ).values(**values, version=PatientModel.version + 1).returning(PatientModel),
            execution_options={'populate_existing': True})
        if item is None:
            exists = self.session.scalar(select(PatientModel.id).where(PatientModel.id == patient_id))
            self.session.rollback()
            if exists is None:
                return None
            raise ConflictError("Este paciente foi alterado por outra operação. Seu rascunho foi mantido. Carregue o cadastro atual antes de salvar novamente.")

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def _deletion_state(self, patient_id, version, can_delete_exams):
        if type(version) is not int or version < 1:
            raise ValidationError("Recarregue o cadastro antes de confirmar a exclusão.")
        item = self.session.scalar(select(PatientModel).where(PatientModel.id == patient_id)
            .with_for_update().execution_options(populate_existing=True))
        if item is None:
            return None, []
        exams = list(self.session.scalars(select(ExamModel).where(ExamModel.patient_id == patient_id)
            .execution_options(populate_existing=True)))
        if exams and not can_delete_exams:
            raise ForbiddenError("Excluir este paciente exige também permissão para excluir exames.")
        if item.version != version:
            raise ConflictError("Este paciente foi alterado. Recarregue e confira antes de excluir.", code="stale_version")
        return item, exams

    def deletion_preview(self, patient_id, version, *, can_delete_exams=False):
        try:
            item, exams = self._deletion_state(patient_id, version, can_delete_exams)
            if item is None:
                return None
            return {"id": item.id, "full_name": item.full_name, "version": item.version,
                    "exam_count": len(exams), "exams_fingerprint": exams_fingerprint(patient_id, exams)}
        finally:
            # Never retain a lock while the user considers the confirmation.
            self.session.rollback()

    def delete(self, patient_id, version, expected_exams, *, can_delete_exams=False) -> bool:
        try:
            if not isinstance(expected_exams, str) or not re.fullmatch(r'[0-9a-f]{64}', expected_exams):
                raise ValidationError("Confira os exames antes de confirmar a exclusão.")
            item, exams = self._deletion_state(patient_id, version, can_delete_exams)
            if item is None:
                self.session.rollback()
                return False
            if exams_fingerprint(patient_id, exams) != expected_exams:
                raise ConflictError("Os exames deste paciente mudaram. Recarregue e confira antes de excluir.", code="stale_exams")
            for exam in exams:
                queue_exam_file(self.session, patient_id, exam.stored_filename)
            self.session.delete(item)
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            if getattr(error.orig, 'sqlstate', None) == '23503':
                raise ConflictError("Paciente possui registros vinculados. Inative o cadastro em vez de excluí-lo.", code="linked_record") from error
            raise
        except Exception:
            self.session.rollback()
            raise
        return True

    def _to_entity(self, model: PatientModel) -> Patient:
        return Patient(
            version=model.version,
            id=model.id,
            full_name=model.full_name,
            preferred_name=model.preferred_name,
            birth_date=model.birth_date,
            cpf=model.cpf,
            rg=model.rg,
            phone=model.phone,
            email=model.email,
            address=model.address,
            preferred_contact_method=model.preferred_contact_method,
            emergency_contact_name=model.emergency_contact_name,
            emergency_contact_phone=model.emergency_contact_phone,
            insurance_provider=model.insurance_provider,
            insurance_plan=model.insurance_plan,
            insurance_member_id=model.insurance_member_id,
            allergies=model.allergies,
            medical_history=model.medical_history,
            notes=model.notes,
            active=model.active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
