from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any
from uuid import UUID


class AuthService(ABC):
    @abstractmethod
    def hash_password(self, password: str) -> str: ...

    @abstractmethod
    def verify_password(self, plain_password: str, hashed_password: str) -> bool: ...

    @abstractmethod
    def create_access_token(self, subject: str, extra_claims: dict[str, Any] | None = None) -> str: ...

    @abstractmethod
    def decode_access_token(self, token: str) -> dict[str, Any] | None: ...


class ExamStorage(ABC):
    @abstractmethod
    def save_file(self, patient_id: UUID, original_filename: str, content: bytes) -> str: ...

    @abstractmethod
    def get_file_path(self, patient_id: UUID, stored_filename: str) -> Path: ...

    @abstractmethod
    def delete_file(self, patient_id: UUID, stored_filename: str) -> None: ...
