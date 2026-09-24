"""Real PostgreSQL migrations/session revocation; isolated homologation schemas only."""
from concurrent.futures import ThreadPoolExecutor
import os
import re
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from src.adapters.db.models.models import AuthSessionModel
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.adapters.security.jwt_auth_service import JwtAuthService
from src.api.deps.auth import get_current_user
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import UnauthorizedError, ValidationError
from src.core.use_cases.auth_use_cases import AuthUseCases


@unittest.skipUnless(os.getenv("RUN_HOMOLOG_TESTS") == "1", "Homologation opt-in required")
class HomologDatabaseTests(unittest.TestCase):
    def setUp(self):
        url = make_url(os.environ["DATABASE_URL"])
        if url.database != "erp_dents_homolog": self.fail("Homologation database required")
        self.schema = "test_sessions_" + uuid4().hex
        self.root = create_engine(url)
        with self.root.begin() as db:
            db.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.engine = create_engine(url, connect_args={"options": f"-csearch_path={self.schema}"})
        self.addCleanup(self.dispose_schema)
        self.migrate("0008_installation_state")
        self.db = Session(self.engine, expire_on_commit=False)
        self.addCleanup(self.db.close)
        self.repo = SqlAlchemyUserRepository(self.db)
        self.auth = JwtAuthService()
        self.uc = AuthUseCases(self.repo, self.auth)
        self.password = "fictitious-session-password"
        self.user = self.repo.create({"name": "Session Test", "email": "session@example.com",
            "role": UserRole.admin, "is_active": True,
            "password_hash": self.auth.hash_password(self.password)})
        # create() refreshes the row, opening a read transaction. Release it
        # before a separate migration connection needs an exclusive users lock.
        self.db.rollback()
        self.migrate("head")

    def migrate(self, revision):
        result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision],
            env={**os.environ, "PGOPTIONS": f"-csearch_path={self.schema}"}, capture_output=True)
        self.assertEqual(result.returncode, 0, "Isolated migration failed")

    def dispose_schema(self):
        self.engine.dispose()
        if not re.fullmatch(r"test_sessions_[0-9a-f]{32}", self.schema): raise RuntimeError("Invalid schema")
        with self.root.begin() as db: db.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.root.dispose()

    def login(self):
        return self.uc.login(self.user.email, self.password)[0]

    def accepted(self, token):
        # Separate request/session, as in the running application.
        with Session(self.engine) as db:
            self.assertEqual(get_current_user(token, db, self.auth).id, self.user.id)

    def rejected(self, token):
        with Session(self.engine) as db, self.assertRaises(HTTPException) as error:
            get_current_user(token, db, self.auth)
        self.assertEqual(error.exception.status_code, 401)

class AuthSessionTests(HomologDatabaseTests):
    def test_existing_user_migrates_and_legacy_token_is_rejected(self):
        legacy = self.auth.create_access_token(str(self.user.id))
        self.rejected(legacy)
        self.assertTrue(self.auth.verify_password(self.password, self.repo.get(self.user.id).password_hash))
        self.accepted(self.login())

    def test_logout_only_its_session_and_is_idempotent(self):
        first, second = self.login(), self.login()
        self.assertNotEqual(first, second)
        self.uc.logout(first)
        self.uc.logout(first)
        self.rejected(first)
        self.accepted(second)
        self.db.close()
        self.engine.dispose()  # Persisted state survives connections being recreated.
        self.rejected(first)
        self.accepted(second)

    def test_password_change_revokes_all_and_old_password_fails(self):
        first, second = self.login(), self.login()
        self.uc.change_password(self.user.id, self.password, "new-fictitious-password")
        self.rejected(first)
        self.rejected(second)
        with self.assertRaises(UnauthorizedError): self.login()
        self.accepted(self.uc.login(self.user.email, "new-fictitious-password")[0])

    def test_failed_password_change_preserves_sessions(self):
        token = self.login()
        with self.assertRaises(ValidationError):
            self.uc.change_password(self.user.id, "wrong-password", "new-fictitious-password")
        self.accepted(token)

    def test_reset_password_revokes_sessions_atomically(self):
        token = self.login()
        with self.repo.administration_lock():
            self.repo.update(self.user.id, {"password_hash": self.auth.hash_password("reset-fictitious")})
        self.rejected(token)
        self.accepted(self.uc.login(self.user.email, "reset-fictitious")[0])

    def test_disable_reenable_never_resurrects_session(self):
        token = self.login()
        for active in (False, True):
            with self.repo.administration_lock(): self.repo.update(self.user.id, {"is_active": active})
            self.rejected(token)
        self.accepted(self.login())

    def test_role_change_revokes_but_name_change_preserves(self):
        token = self.login()
        with self.repo.administration_lock(): self.repo.update(self.user.id, {"name": "New Name"})
        self.accepted(token)
        with self.repo.administration_lock(): self.repo.update(self.user.id, {"role": UserRole.reception})
        self.rejected(token)

    def test_delete_user_cascades_sessions(self):
        token = self.login()
        with self.repo.administration_lock(): self.repo.delete(self.user.id)
        self.rejected(token)
        self.assertEqual(list(self.db.scalars(select(AuthSessionModel))), [])

    def test_expired_and_foreign_sessions_rejected_and_expired_rows_pruned(self):
        token = self.login()
        claims = self.auth.decode_access_token(token)
        other_subject = self.auth.create_access_token(str(uuid4()), {"jti": claims["jti"]})
        self.rejected(other_subject)
        self.db.execute(text("UPDATE auth_sessions SET expires_at = now() - interval '1 second'"))
        self.db.commit()
        self.rejected(token)
        self.accepted(self.login())
        self.assertEqual(len(list(self.db.scalars(select(AuthSessionModel)))), 1)

    def test_failed_update_rolls_back_revocation(self):
        token = self.login()
        with self.assertRaises(RuntimeError), self.repo.administration_lock():
            with patch.object(self.db, "commit", side_effect=RuntimeError("simulated failure")):
                self.repo.update(self.user.id, {"is_active": False})
        self.accepted(token)
        self.assertTrue(self.repo.get(self.user.id).is_active)

    def test_login_verified_before_reset_cannot_mint_session_after_reset(self):
        verified, proceed = threading.Event(), threading.Event()
        service = JwtAuthService()
        original = service.verify_password
        def verify(*args):
            result = original(*args)
            verified.set()
            if not proceed.wait(10): raise RuntimeError("Test synchronization timeout")
            return result
        service.verify_password = verify
        def pending_login():
            with Session(self.engine) as db:
                try:
                    AuthUseCases(SqlAlchemyUserRepository(db), service).login(self.user.email, self.password)
                except UnauthorizedError:
                    return "rejected"
                return "accepted"
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(pending_login)
            try:
                self.assertTrue(verified.wait(10))
                self.uc.change_password(self.user.id, self.password, "concurrent-new-password")
            finally:
                proceed.set()
            self.assertEqual(future.result(timeout=10), "rejected")
        self.assertEqual(list(self.db.scalars(select(AuthSessionModel))), [])

    def test_local_reset_script_revokes(self):
        token = self.login()
        result = subprocess.run([sys.executable, "scripts/reset_admin_password.py", self.user.email,
            "--password-stdin"], input=b"local-fictitious-reset\n", env={**os.environ, "PGOPTIONS": f"-csearch_path={self.schema}"},
            capture_output=True)
        self.assertEqual(result.returncode, 0, "Isolated local password reset failed")
        self.rejected(token)
        self.accepted(self.uc.login(self.user.email, "local-fictitious-reset")[0])
