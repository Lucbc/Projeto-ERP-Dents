from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(slots=True)
class Settings:
    database_url: str
    jwt_secret_key: str
    jwt_expire_minutes: int
    cors_origins_raw: str
    exams_base_path: str
    bootstrap_token: str = ""
    exam_max_bytes: int = 20 * 1024 * 1024
    exam_quota_bytes: int = 50 * 1024 * 1024 * 1024
    clamav_host: str = "clamav"
    exam_maintenance_seconds: int = 300

    @property
    def cors_origins(self) -> list[str]:
        return [value.strip() for value in self.cors_origins_raw.split(",") if value.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    secret = os.getenv("JWT_SECRET_KEY", "")
    if len(secret.strip()) < 32 or secret.upper().startswith("CHANGE_ME"):
        raise ValueError("Configure JWT_SECRET_KEY com pelo menos 32 caracteres aleatórios.")
    expiry = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
    if not 1 <= expiry <= 10080:
        raise ValueError("JWT_EXPIRE_MINUTES deve estar entre 1 e 10080.")
    exam_limit = int(os.getenv("EXAM_MAX_BYTES", str(20 * 1024 * 1024)))
    if not 1024 <= exam_limit <= 1024 * 1024 * 1024:
        raise ValueError("EXAM_MAX_BYTES deve estar entre 1024 e 1073741824.")
    quota = int(os.getenv("EXAM_QUOTA_BYTES", str(50 * 1024 * 1024 * 1024)))
    if quota < exam_limit:
        raise ValueError("EXAM_QUOTA_BYTES deve ser pelo menos EXAM_MAX_BYTES.")
    maintenance_seconds = int(os.getenv("EXAM_MAINTENANCE_SECONDS", "300"))
    if not 10 <= maintenance_seconds <= 3600:
        raise ValueError("EXAM_MAINTENANCE_SECONDS deve estar entre 10 e 3600.")
    return Settings(
        database_url=os.getenv(
            "DATABASE_URL", "postgresql+psycopg://erp_user:erp_password@db:5432/erp_dents"
        ),
        jwt_secret_key=secret,
        jwt_expire_minutes=expiry,
        cors_origins_raw=os.getenv("CORS_ORIGINS", "http://localhost:3000"),
        exams_base_path=os.getenv("EXAMS_BASE_PATH", "/data/exams"),
        bootstrap_token=os.getenv("BOOTSTRAP_TOKEN", ""),
        exam_max_bytes=exam_limit,
        exam_quota_bytes=quota,
        clamav_host=os.getenv("CLAMAV_HOST", "clamav"),
        exam_maintenance_seconds=maintenance_seconds,
    )
