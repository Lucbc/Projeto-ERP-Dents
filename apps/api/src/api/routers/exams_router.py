from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from src.adapters.db.repositories.exam_repository import SqlAlchemyExamRepository
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.adapters.storage.filesystem_exam_storage import FileSystemExamStorage
from src.api.deps.auth import require_permission
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import ExamResponse
from src.core.use_cases.exam_use_cases import ExamUseCases
from src.config import get_settings
from src.adapters.db.exam_cleanup import process_exam_deletions

router = APIRouter(prefix="/api", tags=["exams"])


@router.get("/exams/upload-policy", dependencies=[Depends(require_permission("exams", "view"))])
def upload_policy():
    return {"max_bytes": get_settings().exam_max_bytes, "extensions": [".pdf", ".jpg", ".jpeg", ".png"]}


def build_use_case(db: Session) -> ExamUseCases:
    return ExamUseCases(
        exam_repository=SqlAlchemyExamRepository(db),
        patient_repository=SqlAlchemyPatientRepository(db),
        exam_storage=FileSystemExamStorage(),
        max_bytes=get_settings().exam_max_bytes,
    )


@router.get(
    "/patients/{patient_id}/exams",
    response_model=list[ExamResponse],
    dependencies=[Depends(require_permission("exams", "view"))],
)
def list_exams(patient_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = build_use_case(db)
    return use_case.list_by_patient(patient_id)


@router.post(
    "/patients/{patient_id}/exams",
    response_model=ExamResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("exams", "create"))],
)
def upload_exam(
    patient_id: UUID,
    file: UploadFile = File(...),
    notes: str | None = Form(default=None, max_length=2000),
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    return use_case.upload(
        patient_id=patient_id,
        original_filename=file.filename or "exam.bin",
        mime_type=file.content_type or "application/octet-stream",
        content=file.file,
        notes=notes,
    )


@router.get(
    "/exams/{exam_id}/download",
    dependencies=[Depends(require_permission("exams", "view"))],
)
def download_exam(exam_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = build_use_case(db)
    exam, file_path = use_case.get_download(exam_id)
    return FileResponse(
        path=file_path,
        media_type="application/octet-stream",
        filename=exam.original_filename,
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'",
                 "Cache-Control": "no-store"},
    )


@router.delete(
    "/exams/{exam_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_permission("exams", "delete"))],
)
def delete_exam(exam_id: UUID, db: Session = Depends(get_db_dep)) -> Response:
    use_case = build_use_case(db)
    use_case.delete(exam_id)
    process_exam_deletions(db, FileSystemExamStorage(), limit=10)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
