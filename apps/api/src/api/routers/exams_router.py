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

router = APIRouter(prefix="/api", tags=["exams"])


def build_use_case(db: Session) -> ExamUseCases:
    return ExamUseCases(
        exam_repository=SqlAlchemyExamRepository(db),
        patient_repository=SqlAlchemyPatientRepository(db),
        exam_storage=FileSystemExamStorage(),
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
async def upload_exam(
    patient_id: UUID,
    file: UploadFile = File(...),
    notes: str | None = Form(default=None),
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    content = await file.read()
    return use_case.upload(
        patient_id=patient_id,
        original_filename=file.filename or "exam.bin",
        mime_type=file.content_type or "application/octet-stream",
        content=content,
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
        media_type=exam.mime_type,
        filename=exam.original_filename,
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)
