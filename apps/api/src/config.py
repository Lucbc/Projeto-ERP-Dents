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

    @property
    def cors_origins(self) -> list[str]:
        return [value.strip() for value in self.cors_origins_raw.split(",") if value.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv(
            "DATABASE_URL", "postgresql+psycopg://erp_user:erp_password@db:5432/erp_dents"
        ),
        jwt_secret_key=os.getenv("JWT_SECRET_KEY", "CHANGE_ME"),
        jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", "480")),
        cors_origins_raw=os.getenv("CORS_ORIGINS", "http://localhost:3000"),
        exams_base_path=os.getenv("EXAMS_BASE_PATH", "/data/exams"),
    )
