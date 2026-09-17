"""Commit cleanup intent with metadata; retry filesystem operations independently."""
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError

from src.adapters.db.models.models import ExamFileDeletionModel, ExamModel, utcnow


def queue_exam_file(db, patient_id, stored_filename):
    db.execute(insert(ExamFileDeletionModel).values(id=uuid4(), patient_id=patient_id,
        stored_filename=stored_filename, created_at=utcnow()).on_conflict_do_nothing(
            constraint="uq_exam_file_deletion"))


def process_exam_deletions(db, storage, limit=100):
    removed = failed = 0
    seen = []
    for _ in range(limit):
        try:
            job = db.scalar(select(ExamFileDeletionModel).where(
                ExamFileDeletionModel.id.not_in(seen)).order_by(ExamFileDeletionModel.created_at)
                .with_for_update(skip_locked=True).limit(1))
            if job is None:
                db.rollback()
                break
            seen.append(job.id)
            # Never remove a file still referenced, including a manually restored record.
            referenced = db.scalar(select(ExamModel.id).where(ExamModel.patient_id == job.patient_id,
                ExamModel.stored_filename == job.stored_filename))
            if referenced is not None:
                failed += 1
                db.rollback()
                continue
            storage.delete_file(job.patient_id, job.stored_filename)
            db.delete(job)
            db.commit()
            removed += 1
        except (OSError, ValueError, SQLAlchemyError):
            db.rollback()
            failed += 1
    return {"removed": removed, "pending_failures": failed}
