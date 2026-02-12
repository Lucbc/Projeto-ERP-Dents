from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.error_handlers import register_exception_handlers
from src.api.routers.appointments_router import router as appointments_router
from src.api.routers.auth_router import router as auth_router
from src.api.routers.dentists_router import router as dentists_router
from src.api.routers.exams_router import router as exams_router
from src.api.routers.patients_router import router as patients_router
from src.api.routers.users_router import router as users_router
from src.config import get_settings

settings = get_settings()

app = FastAPI(
    title="ERP Dents API",
    version="0.1.0",
    description="API da clínica de ortodontia (MVP).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)


@app.on_event("startup")
def startup_event() -> None:
    Path(settings.exams_base_path).mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(patients_router)
app.include_router(dentists_router)
app.include_router(users_router)
app.include_router(appointments_router)
app.include_router(exams_router)

