"""Initial setup tests against isolated PostgreSQL schemas, including real migrations."""
from concurrent.futures import ThreadPoolExecutor
import os
import re
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.adapters.db.models.models import InstallationStateModel
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ConflictError, ForbiddenError, ValidationError
from src.core.use_cases.auth_use_cases import AuthUseCases

TEST_CODE = "fictitious-activation-code-for-tests-only"


class TestAuth:
    def hash_password(self, password): return "test-hash"


@unittest.skipUnless(os.getenv("RUN_HOMOLOG_TESTS") == "1", "Explicit homologation opt-in required")
class BootstrapTests(unittest.TestCase):
    def setUp(self):
        url = make_url(os.environ["DATABASE_URL"])
        if url.database != "erp_dents_homolog": self.fail("Homologation database required")
        self.schema = "test_bootstrap_" + uuid4().hex
        self.root = create_engine(url)
        with self.root.begin() as db:
            db.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.engine = create_engine(url, connect_args={"options": f"-csearch_path={self.schema}"})
        self.addCleanup(self.dispose_schema)
        # Stop at the previous version so migration behavior on existing databases is tested too.
        self.migrate("0007_financial_patient")
        self.db = Session(self.engine, expire_on_commit=False)
        self.addCleanup(self.db.close)
        self.repo = SqlAlchemyUserRepository(self.db)
        self.uc = AuthUseCases(self.repo, TestAuth(), TEST_CODE)

    def migrate(self, revision):
        result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision],
            env={**os.environ, "PGOPTIONS": f"-csearch_path={self.schema}"}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, "Isolated schema migration failed")

    def dispose_schema(self):
        self.engine.dispose()
        if not re.fullmatch(r"test_bootstrap_[0-9a-f]{32}", self.schema):
            raise RuntimeError("Invalid test schema")
        with self.root.begin() as db:
            db.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.root.dispose()

    def initialize(self, code=TEST_CODE, email="initial@example.com"):
        return self.uc.bootstrap_admin(" Initial Admin ", email, "test-password", code)

    def test_fresh_installation_and_single_use(self):
        self.migrate("head")
        self.assertTrue(self.uc.needs_bootstrap())
        user = self.initialize()
        self.assertEqual(user.role, UserRole.admin)
        self.assertTrue(user.is_active)
        self.assertEqual(user.name, "Initial Admin")
        self.assertFalse(self.uc.needs_bootstrap())
        with self.assertRaises(ConflictError): self.initialize(email="second@example.com")
        self.assertEqual(self.repo.count_all(), 1)

    def test_missing_wrong_or_unicode_code_does_not_consume_activation(self):
        self.migrate("head")
        for code in (None, "", "wrong", "x" * 257, "\u00e1" * 40):
            with self.subTest(case=code is None), self.assertRaises(ForbiddenError): self.initialize(code)
        self.assertEqual(self.repo.count_all(), 0)
        self.assertTrue(self.uc.needs_bootstrap())
        self.initialize()

    def test_missing_or_short_server_code_fails_closed(self):
        self.migrate("head")
        for configured in ("", "short"):
            uc = AuthUseCases(self.repo, TestAuth(), configured)
            with self.assertRaises(ForbiddenError):
                uc.bootstrap_admin("Admin", "initial@example.com", "test-password", configured)
        self.assertTrue(self.uc.needs_bootstrap())

    def test_invalid_name_or_password_does_not_consume_activation(self):
        self.migrate("head")
        for name, password in (("   ", "test-password"), ("Admin", "short")):
            with self.subTest(name=name), self.assertRaises(ValidationError):
                self.uc.bootstrap_admin(name, "initial@example.com", password, TEST_CODE)
        self.assertTrue(self.uc.needs_bootstrap())

    def test_existing_installation_migrates_as_completed_without_changing_users(self):
        user = self.repo.create({"name": "Existing", "email": "existing@example.com", "role": UserRole.admin,
                                 "is_active": True, "password_hash": "preserved-hash"})
        self.db.rollback()
        self.migrate("head")
        self.assertFalse(self.uc.needs_bootstrap())
        self.assertEqual(self.repo.get(user.id).password_hash, "preserved-hash")
        with self.assertRaises(ConflictError): self.initialize()

    def test_existing_inactive_non_admin_also_closes_initialization(self):
        self.repo.create({"name": "Existing", "email": "existing@example.com", "role": UserRole.reception,
                          "is_active": False, "password_hash": "preserved-hash"})
        self.db.rollback()
        self.migrate("head")
        self.assertFalse(self.uc.needs_bootstrap())

    def test_external_user_deletion_does_not_reopen_setup(self):
        self.migrate("head")
        user = self.initialize()
        self.repo.delete(user.id)  # Deliberate direct deletion in this disposable schema only.
        self.assertEqual(self.repo.count_all(), 0)
        with Session(self.engine) as fresh:
            uc = AuthUseCases(SqlAlchemyUserRepository(fresh), TestAuth(), TEST_CODE)
            self.assertFalse(uc.needs_bootstrap())
            with self.assertRaises(ConflictError):
                uc.bootstrap_admin("Admin", "other@example.com", "test-password", TEST_CODE)

    def test_missing_installation_row_fails_closed(self):
        self.migrate("head")
        self.db.execute(text("DELETE FROM installation_state"))
        self.db.commit()
        self.assertFalse(self.uc.needs_bootstrap())
        with self.assertRaises(ConflictError): self.initialize()

    def test_failed_insert_rolls_back_completed_flag(self):
        self.migrate("head")
        with patch.object(self.uc.auth_service, "hash_password", return_value=None):
            with self.assertRaises(IntegrityError): self.initialize()
        self.assertTrue(self.uc.needs_bootstrap())
        self.assertEqual(self.repo.count_all(), 0)
        self.initialize()

    def test_concurrent_requests_create_exactly_one_administrator(self):
        self.migrate("head")
        ready = threading.Barrier(3)
        class PausedAuth(TestAuth):
            def hash_password(self, password):
                ready.wait(timeout=5)
                return super().hash_password(password)
        def attempt(number):
            with Session(self.engine) as db:
                uc = AuthUseCases(SqlAlchemyUserRepository(db), PausedAuth(), TEST_CODE)
                try:
                    uc.bootstrap_admin("Admin", f"initial{number}@example.com", "test-password", TEST_CODE)
                    return "success"
                except ConflictError:
                    return "conflict"
        with ThreadPoolExecutor(max_workers=2) as pool:
            with self.repo.administration_lock():
                futures = [pool.submit(attempt, number) for number in (1, 2)]
                ready.wait(timeout=5)
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline:
                    waiting = self.db.scalar(text("""SELECT count(*) FROM pg_locks
                        WHERE relation = 'users'::regclass AND mode = 'ShareRowExclusiveLock' AND NOT granted"""))
                    if waiting == 2: break
                    time.sleep(0.01)
                self.assertEqual(waiting, 2)
            self.assertEqual(sorted(f.result(timeout=10) for f in futures), ["conflict", "success"])
        self.assertEqual(self.repo.count_active_admins(), 1)
        self.assertTrue(self.db.get(InstallationStateModel, 1).bootstrap_completed)


if __name__ == "__main__": unittest.main(verbosity=2)
