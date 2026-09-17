"""Serialize publication/reconciliation across API workers using PostgreSQL.

Orphans are moved, never purged. A stopped process releases the database lock.
The dedicated connection keeps this lock across repository commits/rollbacks.
"""
from contextlib import contextmanager
import os
from pathlib import Path
import time
from uuid import UUID

from sqlalchemy import select, text

from src.adapters.db.exam_cleanup import process_exam_deletions
from src.adapters.db.models.models import ExamModel
from src.core.domain.exceptions import ServiceUnavailableError, StorageUnavailableError


@contextmanager
def exam_storage_lock(engine):
    with engine.connect() as connection, connection.begin():
        locked = connection.scalar(text("SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ' exam-storage', 0))"))
        if not locked:
            raise ServiceUnavailableError("Armazenamento de exames ocupado. Tente novamente em alguns segundos.")
        yield


def storage_bytes(base):
    total = 0
    def fail(error):
        raise error
    for root, directories, files in os.walk(base, followlinks=False, onerror=fail):
        directories[:] = [d for d in directories if not (Path(root) / d).is_symlink()]
        for name in files:
            path = Path(root) / name
            if not path.is_symlink():
                try:
                    total += path.stat().st_size
                except FileNotFoundError:  # Concurrent confirmed deletion can only free space.
                    pass
    return total


def ensure_quota(storage, size, quota):
    try:
        if storage_bytes(storage.base_path) + size > quota:
            raise StorageUnavailableError("Limite total de exames atingido. Solicite revisão do armazenamento ao administrador.")
    except OSError as error:
        raise StorageUnavailableError("Não foi possível verificar o espaço dos exames.") from error


def reconcile_exams(db, storage, minimum_age=86400):
    """Caller holds exam_storage_lock; return aggregate counts only."""
    base = storage.base_path
    refs = {(str(row.patient_id), row.stored_filename) for row in db.scalars(select(ExamModel))}
    moved = recent = unsafe = 0
    missing = 0
    for patient, name in refs:
        try:
            missing += not storage.get_file_path(UUID(patient), name).is_file()
        except ValueError:
            unsafe += 1
    quarantine = base / '.quarantine'
    if quarantine.is_symlink():
        raise StorageUnavailableError("Diretório de quarentena inválido.")
    for directory in base.iterdir():
        if directory.name.startswith('.'):
            continue
        if directory.is_symlink() or not directory.is_dir():
            unsafe += 1
            continue
        try:
            UUID(directory.name)
        except ValueError:
            unsafe += 1
            continue
        for path in directory.iterdir():
            if path.is_symlink() or not path.is_file():
                unsafe += 1
                continue
            if (directory.name, path.name) in refs:
                continue
            try:
                if time.time() - path.stat().st_mtime < minimum_age:
                    recent += 1
                    continue
                target_dir = quarantine / directory.name
                target_dir.mkdir(parents=True, exist_ok=True)
                if target_dir.is_symlink():
                    raise StorageUnavailableError("Diretório de quarentena inválido.")
                target = target_dir / path.name
                if target.exists() or target.is_symlink():
                    unsafe += 1
                    continue
                path.rename(target)
                moved += 1
            except FileNotFoundError:
                pass  # A committed cleanup may have removed this orphan.
    db.rollback()
    return {"quarantined": moved, "recent_unreferenced": recent, "missing_referenced": missing, "unsafe_entries": unsafe}


def restore_quarantined(storage, patient_id, filename):
    target = storage.get_file_path(patient_id, filename)
    source = storage.base_path / '.quarantine' / str(patient_id) / filename
    if source.is_symlink() or not source.resolve().is_relative_to(storage.base_path / '.quarantine'):
        raise ValueError("Caminho de quarentena inválido.")
    target.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation avoids replacing an existing file, including on Unix.
    import shutil
    created = False
    try:
        with source.open('rb') as original, target.open('xb') as output:
            created = True
            shutil.copyfileobj(original, output, 65536)
        source.unlink()
    except Exception:
        if created:
            target.unlink(missing_ok=True)
        raise


def maintain_exams(db, storage):
    with exam_storage_lock(db.get_bind()):
        report = process_exam_deletions(db, storage, limit=1000)
        report.update(reconcile_exams(db, storage))
        report['used_bytes'] = storage_bytes(storage.base_path)
        return report
