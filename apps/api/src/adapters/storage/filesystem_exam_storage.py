from __future__ import annotations

import os
import uuid
import io
import shutil
from pathlib import Path
from uuid import UUID

from src.config import get_settings
from src.core.ports.services import ExamStorage
from src.core.domain.exceptions import PayloadTooLargeError, StorageUnavailableError


class FileSystemExamStorage(ExamStorage):
    def __init__(self) -> None:
        settings = get_settings()
        self.base_path = Path(settings.exams_base_path)
        try:
            self.base_path.mkdir(parents=True, exist_ok=True)
        except OSError as error:
            raise StorageUnavailableError("Armazenamento de exames indisponível.") from error
        self.base_path = self.base_path.resolve()
        self.max_bytes = settings.exam_max_bytes

    def save_file(self, patient_id: UUID, original_filename: str, content) -> str:
        patient_path = self.base_path / str(patient_id)

        _, ext = os.path.splitext(original_filename)
        stored_filename = f"{uuid.uuid4()}{ext}"

        file_path = self.get_file_path(patient_id, stored_filename)
        stream = io.BytesIO(content) if isinstance(content, bytes) else content
        created = False
        try:
            patient_path.mkdir(parents=True, exist_ok=True)
            if shutil.disk_usage(self.base_path).free < self.max_bytes + 50 * 1024 * 1024:
                raise StorageUnavailableError("Espaço insuficiente para receber o exame.")
            with file_path.open("xb") as output:
                created = True
                size = 0
                while chunk := stream.read(65536):
                    size += len(chunk)
                    if size > self.max_bytes:
                        raise PayloadTooLargeError("Arquivo excede o limite de envio.")
                    output.write(chunk)
        except Exception as error:
            if created:
                try:
                    file_path.unlink(missing_ok=True)
                except OSError:
                    pass  # Reconciliation quarantines the incomplete file after its grace period.
            if isinstance(error, OSError):
                raise StorageUnavailableError("Não foi possível gravar o exame. Verifique o armazenamento do servidor.") from error
            raise
        return stored_filename

    def get_file_path(self, patient_id: UUID, stored_filename: str) -> Path:
        if (self.base_path / str(patient_id)).is_symlink():
            raise ValueError("Diretório de exame inválido.")
        patient_path = (self.base_path / str(patient_id)).resolve()
        target = (patient_path / stored_filename).resolve()
        if (not patient_path.is_relative_to(self.base_path) or not target.is_relative_to(patient_path)
                or Path(stored_filename).name != stored_filename or "\\" in stored_filename):
            raise ValueError("Caminho de exame inválido.")
        return target

    def delete_file(self, patient_id: UUID, stored_filename: str) -> None:
        file_path = self.get_file_path(patient_id, stored_filename)
        file_path.unlink(missing_ok=True)
