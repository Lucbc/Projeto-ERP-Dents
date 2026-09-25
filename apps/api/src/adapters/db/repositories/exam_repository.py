from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from src.adapters.db.models.models import ExamModel, PatientModel
from src.adapters.db.exam_cleanup import queue_exam_file
from src.core.domain.entities import Exam
from src.core.ports.repositories import ExamRepository
from src.core.domain.exceptions import ConflictError


class SqlAlchemyExamRepository(ExamRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_by_patient(self, patient_id):
        items = self.session.scalars(
            select(ExamModel)
            .where(ExamModel.patient_id == patient_id)
            .order_by(ExamModel.uploaded_at.desc())
        ).all()
        return [self._to_entity(item) for item in items]

    def get(self, exam_id):
        item = self.session.get(ExamModel, exam_id)
        return self._to_entity(item) if item else None

    def create(self, data: dict) -> Exam:
        item = ExamModel(**data)
        self.session.add(item)
        try:
            # Serialize the exam set with patient deletion/preview, before autoflush.
            with self.session.no_autoflush:
                patient = self.session.scalar(select(PatientModel.id).where(
                    PatientModel.id == item.patient_id).with_for_update())
            if patient is None:
                raise ConflictError("Não foi possível registrar o exame. Confira se o paciente ainda está disponível.")
            self.session.flush()
            result = self._to_entity(item)
            self.session.commit()
            return result
        except IntegrityError as error:
            self.session.rollback()
            raise ConflictError("Não foi possível registrar o exame. Confira se o paciente ainda está disponível.") from error
        except Exception:
            self.session.rollback()
            raise

    def file_referenced(self, patient_id, stored_filename):
        return self.session.scalar(select(ExamModel.id).where(ExamModel.patient_id == patient_id,
            ExamModel.stored_filename == stored_filename)) is not None

    def delete(self, exam_id) -> bool:
        try:
            patient_id = self.session.scalar(select(ExamModel.patient_id).where(ExamModel.id == exam_id))
            if patient_id is None:
                self.session.rollback()
                return False
            # Same lock order as patient deletion; no physical deletion before commit.
            self.session.scalar(select(PatientModel.id).where(PatientModel.id == patient_id).with_for_update())
            item = self.session.scalar(select(ExamModel).where(ExamModel.id == exam_id)
                .with_for_update().execution_options(populate_existing=True))
            if item is None:
                self.session.rollback()
                return False
            queue_exam_file(self.session, item.patient_id, item.stored_filename)
            self.session.delete(item)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        return True

    def _to_entity(self, model: ExamModel) -> Exam:
        return Exam(
            id=model.id,
            patient_id=model.patient_id,
            original_filename=model.original_filename,
            stored_filename=model.stored_filename,
            mime_type=model.mime_type,
            size_bytes=model.size_bytes,
            uploaded_at=model.uploaded_at,
            notes=model.notes,
        )
