from __future__ import annotations

from pathlib import Path
import asyncio
import logging
from starlette.concurrency import run_in_threadpool

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.error_handlers import register_exception_handlers
from src.api.error_boundary import SafeErrorMiddleware
from src.api.routers.appointments_router import router as appointments_router
from src.api.routers.auth_router import router as auth_router
from src.api.routers.consultations_router import router as consultations_router
from src.api.routers.dentists_router import router as dentists_router
from src.api.routers.exams_router import router as exams_router
from src.api.routers.financial_router import router as financial_router
from src.api.routers.patients_router import router as patients_router
from src.api.routers.permissions_router import router as permissions_router
from src.api.routers.procedures_router import router as procedures_router
from src.api.routers.specialties_router import router as specialties_router
from src.api.routers.users_router import router as users_router
from src.config import get_settings
from src.api.upload_limit import ExamUploadLimitMiddleware
from src.api.browser_session import BrowserSessionMiddleware

settings = get_settings()

app = FastAPI(
    title="ERP Dents API",
    version="0.1.0",
    description="API da clínica de ortodontia (MVP).",
)

app.add_middleware(ExamUploadLimitMiddleware, max_bytes=settings.exam_max_bytes)
app.add_middleware(BrowserSessionMiddleware)
app.add_middleware(SafeErrorMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.public_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)


def maintenance_cycle():
    Path(settings.exams_base_path).mkdir(parents=True, exist_ok=True)
    from src.adapters.db.database import SessionLocal
    from src.adapters.db.exam_maintenance import maintain_exams
    from src.adapters.storage.filesystem_exam_storage import FileSystemExamStorage
    with SessionLocal() as db:
        report = maintain_exams(db, FileSystemExamStorage())
        logger = logging.getLogger(__name__)
        if any(report[key] for key in ('pending_failures', 'missing_referenced', 'unsafe_entries', 'quarantined')):
            logger.warning("Exam maintenance counts: %s", report)
        else:
            logger.info("Exam maintenance counts: %s", report)


async def maintenance_loop():
    while True:
        try:
            await run_in_threadpool(maintenance_cycle)
        except Exception:
            # No file names or database URLs in logs. Next cycle retries safely.
            logging.getLogger(__name__).warning("Exam maintenance unavailable; will retry.")
        await asyncio.sleep(settings.exam_maintenance_seconds)


@app.on_event("startup")
async def startup_event():
    app.state.maintenance_task = asyncio.create_task(maintenance_loop())


@app.on_event("shutdown")
async def shutdown_event():
    app.state.maintenance_task.cancel()
    try:
        await app.state.maintenance_task
    except asyncio.CancelledError:
        pass


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(patients_router)
app.include_router(dentists_router)
app.include_router(users_router)
app.include_router(appointments_router)
app.include_router(exams_router)
app.include_router(permissions_router)
app.include_router(consultations_router)
app.include_router(procedures_router)
app.include_router(specialties_router)
app.include_router(financial_router)
