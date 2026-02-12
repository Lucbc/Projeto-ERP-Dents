from __future__ import annotations

from pathlib import Path
from uuid import UUID

from src.core.domain.entities import Exam
from src.core.domain.exceptions import NotFoundError, ValidationError
from src.core.ports.repositories import ExamRepository, PatientRepository
from src.core.ports.services import ExamStorage


class ExamUseCases:
    def __init__(
        self,
        exam_repository: ExamRepository,
        patient_repository: PatientRepository,
        exam_storage: ExamStorage,
    ) -> None:
        self.exam_repository = exam_repository
        self.patient_repository = patient_repository
        self.exam_storage = exam_storage

    def list_by_patient(self, patient_id: UUID) -> list[Exam]:
        self._ensure_patient_exists(patient_id)
        return self.exam_repository.list_by_patient(patient_id)

    def upload(
        self,
        patient_id: UUID,
        original_filename: str,
        mime_type: str,
        content: bytes,
        notes: str | None,
    ) -> Exam:
        self._ensure_patient_exists(patient_id)

        if not original_filename:
            raise ValidationError("Nome do arquivo é obrigatório.")

        if len(content) == 0:
            raise ValidationError("Arquivo vazio não é permitido.")

        stored_filename = self.exam_storage.save_file(patient_id, original_filename, content)

        return self.exam_repository.create(
            {
                "patient_id": patient_id,
                "original_filename": original_filename,
                "stored_filename": stored_filename,
                "mime_type": mime_type or "application/octet-stream",
                "size_bytes": len(content),
                "notes": notes,
            }
        )

    def get_download(self, exam_id: UUID) -> tuple[Exam, Path]:
        exam = self.exam_repository.get(exam_id)
        if exam is None:
            raise NotFoundError("Exame não encontrado.")

        path = self.exam_storage.get_file_path(exam.patient_id, exam.stored_filename)
        if not path.exists():
            raise NotFoundError("Arquivo do exame não encontrado no armazenamento.")

        return exam, path

    def delete(self, exam_id: UUID) -> None:
        exam = self.exam_repository.get(exam_id)
        if exam is None:
            raise NotFoundError("Exame não encontrado.")

        self.exam_storage.delete_file(exam.patient_id, exam.stored_filename)
        self.exam_repository.delete(exam_id)

    def _ensure_patient_exists(self, patient_id: UUID) -> None:
        patient = self.patient_repository.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente não encontrado.")

