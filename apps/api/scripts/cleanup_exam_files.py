"""Run with python -m scripts.cleanup_exam_files; processes committed deletion intents only."""
import json
from sqlalchemy import select, func

from src.adapters.db.database import SessionLocal
from src.adapters.db.exam_cleanup import process_exam_deletions
from src.adapters.db.exam_maintenance import exam_storage_lock
from src.adapters.db.models.models import ExamFileDeletionModel
from src.adapters.storage.filesystem_exam_storage import FileSystemExamStorage


def main():
    with SessionLocal() as db:
        with exam_storage_lock(db.get_bind()):
            result = process_exam_deletions(db, FileSystemExamStorage(), limit=1000)
        result["pending"] = db.scalar(select(func.count()).select_from(ExamFileDeletionModel))
        print(json.dumps(result))
        return 1 if result["pending_failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
