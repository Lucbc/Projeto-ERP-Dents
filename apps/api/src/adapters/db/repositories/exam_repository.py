from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.adapters.db.models.models import ExamModel
from src.core.domain.entities import Exam
from src.core.ports.repositories import ExamRepository


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
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, exam_id) -> bool:
        item = self.session.get(ExamModel, exam_id)
        if item is None:
            return False

        self.session.delete(item)
        self.session.commit()
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
