from __future__ import annotations

from pathlib import Path
from uuid import UUID
import io
import logging

from src.core.domain.entities import Exam
from src.core.domain.exceptions import NotFoundError, ValidationError, PayloadTooLargeError, StorageUnavailableError
from src.core.ports.repositories import ExamRepository, PatientRepository
from src.core.ports.services import ExamStorage


class ExamUseCases:
    def __init__(
        self,
        exam_repository: ExamRepository,
        patient_repository: PatientRepository,
        exam_storage: ExamStorage,
        max_bytes: int = 20 * 1024 * 1024,
    ) -> None:
        self.exam_repository = exam_repository
        self.patient_repository = patient_repository
        self.exam_storage = exam_storage
        self.max_bytes = max_bytes

    def list_by_patient(self, patient_id: UUID) -> list[Exam]:
        self._ensure_patient_exists(patient_id)
        return self.exam_repository.list_by_patient(patient_id)

    def upload(
        self,
        patient_id: UUID,
        original_filename: str,
        mime_type: str,
        content,
        notes: str | None,
    ) -> Exam:
        self._ensure_patient_exists(patient_id)

        original_filename = original_filename.replace("\\", "/").split("/")[-1]
        if not original_filename or len(original_filename) > 255 or any(ord(c) < 32 for c in original_filename):
            raise ValidationError("Nome do arquivo é obrigatório.")

        stream = io.BytesIO(content) if isinstance(content, bytes) else content
        stream.seek(0, 2)
        size = stream.tell()
        if size == 0:
            raise ValidationError("Arquivo vazio não é permitido.")
        if size > self.max_bytes:
            raise PayloadTooLargeError("Arquivo excede o limite de envio.")
        stream.seek(0)
        header = stream.read(16)
        stream.seek(max(0, size - 1024))
        tail = stream.read(1024)
        suffix = Path(original_filename).suffix.lower()
        if header.startswith(b"\x89PNG\r\n\x1a\n") and tail.endswith(b"IEND\xaeB`\x82") and suffix == ".png":
            mime_type = "image/png"
        elif header.startswith(b"\xff\xd8\xff") and tail.endswith(b"\xff\xd9") and suffix in (".jpg", ".jpeg"):
            mime_type = "image/jpeg"
        elif header.startswith(b"%PDF-") and b"%%EOF" in tail and suffix == ".pdf":
            mime_type = "application/pdf"
        else:
            raise ValidationError("Envie um PDF, JPG ou PNG com formato e extensão correspondentes.")
        stream.seek(0)

        stored_filename = self.exam_storage.save_file(patient_id, original_filename, stream)

        try:
            return self.exam_repository.create({
                "patient_id": patient_id,
                "original_filename": original_filename,
                "stored_filename": stored_filename,
                "mime_type": mime_type or "application/octet-stream",
                "size_bytes": size,
                "notes": notes,
            })
        except Exception:
            try:
                # A failed/ambiguous commit must never cause deletion of a committed file.
                if not self.exam_repository.file_referenced(patient_id, stored_filename):
                    self.exam_storage.delete_file(patient_id, stored_filename)
            except Exception:
                logging.getLogger(__name__).warning("Falha ao conferir/limpar upload; arquivo preservado para reconciliação.")
            raise

    def get_download(self, exam_id: UUID) -> tuple[Exam, Path]:
        exam = self.exam_repository.get(exam_id)
        if exam is None:
            raise NotFoundError("Exame não encontrado.")

        try:
            path = self.exam_storage.get_file_path(exam.patient_id, exam.stored_filename)
        except ValueError as error:
            raise NotFoundError("Arquivo do exame indisponível.") from error
        except OSError as error:
            raise StorageUnavailableError("Arquivo do exame indisponível no armazenamento.") from error
        try:
            if not path.exists():
                raise NotFoundError("Arquivo do exame não encontrado no armazenamento.")
        except OSError as error:
            raise StorageUnavailableError("Arquivo do exame indisponível no armazenamento.") from error

        return exam, path

    def delete(self, exam_id: UUID) -> None:
        if not self.exam_repository.delete(exam_id):
            raise NotFoundError("Exame não encontrado.")

    def _ensure_patient_exists(self, patient_id: UUID) -> None:
        patient = self.patient_repository.get(patient_id)
        if patient is None:
            raise NotFoundError("Paciente não encontrado.")

