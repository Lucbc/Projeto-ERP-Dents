from __future__ import annotations

import os
import uuid
from pathlib import Path
from uuid import UUID

from src.config import get_settings
from src.core.ports.services import ExamStorage


class FileSystemExamStorage(ExamStorage):
    def __init__(self) -> None:
        settings = get_settings()
        self.base_path = Path(settings.exams_base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def save_file(self, patient_id: UUID, original_filename: str, content: bytes) -> str:
        patient_path = self.base_path / str(patient_id)
        patient_path.mkdir(parents=True, exist_ok=True)

        _, ext = os.path.splitext(original_filename)
        stored_filename = f"{uuid.uuid4()}{ext}"

        file_path = patient_path / stored_filename
        file_path.write_bytes(content)
        return stored_filename

    def get_file_path(self, patient_id: UUID, stored_filename: str) -> Path:
        return self.base_path / str(patient_id) / stored_filename

    def delete_file(self, patient_id: UUID, stored_filename: str) -> None:
        file_path = self.get_file_path(patient_id, stored_filename)
        if file_path.exists():
            file_path.unlink()
