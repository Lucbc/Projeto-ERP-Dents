"""Password compatibility and shared attempt limits in isolated PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
import os
import subprocess
import sys
import getpass
import io
from unittest.mock import patch

from passlib.context import CryptContext
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from test_auth_sessions import HomologDatabaseTests
from src.adapters.db.auth_limiter import AuthLimiter
from src.adapters.db.models.models import AuthAttemptModel
from src.config import get_settings
from src.core.domain.exceptions import RateLimitError, UnauthorizedError, ValidationError


class AuthHardeningTests(HomologDatabaseTests):
    def test_cli_refuses_fallback_to_visible_password_input(self):
        from scripts.reset_admin_password import main
        with patch.object(sys, "argv", ["reset", self.user.email]), \
             patch.object(sys.stdin, "isatty", return_value=True), \
             patch("getpass.getpass", side_effect=getpass.GetPassWarning("hidden input unavailable")), \
             patch.object(sys, "stdout", io.StringIO()):
            self.assertEqual(main(), 1)
        self.accepted(self.login())

    def test_new_hash_distinguishes_password_suffix_after_72_bytes(self):
        first, second = "a" * 72 + "one", "a" * 72 + "two"
        hashed = self.auth.hash_password(first)
        self.assertTrue(hashed.startswith("$bcrypt-sha256$"))
        self.assertTrue(self.auth.verify_password(first, hashed))
        self.assertFalse(self.auth.verify_password(second, hashed))

    def test_legacy_hash_login_is_preserved_without_silent_rewrite(self):
        legacy = CryptContext(schemes=["bcrypt"]).hash(self.password)
        with self.repo.administration_lock(): self.repo.update(self.user.id, {"password_hash": legacy})
        self.accepted(self.login())
        self.assertEqual(self.repo.get(self.user.id).password_hash, legacy)
        # Old bcrypt cannot distinguish beyond byte 72: preserve old semantics until explicit reset.
        long_password = "x" * 80
        old_long = CryptContext(schemes=["bcrypt"]).hash(long_password)
        self.assertTrue(self.auth.verify_password(long_password, old_long))

    def test_unicode_limits_and_invalid_new_passwords(self):
        for password in ("short", "x" * 129, "valid-length\x00", "invalid-surrogate\ud800"):
            with self.subTest(length=len(password)), self.assertRaises(ValidationError):
                self.auth.hash_password(password)
        password = "😀" * 128
        self.assertTrue(self.auth.verify_password(password, self.auth.hash_password(password)))
        self.assertFalse(self.auth.verify_password("\x00" * 8, self.user.password_hash))
        self.assertFalse(self.auth.verify_password("x" * 4097, self.user.password_hash))
        self.assertFalse(self.auth.verify_password(self.password, "broken-hash"))

    def test_login_errors_are_identical_for_unknown_wrong_and_inactive(self):
        messages = []
        for email, password in (("missing@example.com", self.password), (self.user.email, "wrong")):
            with self.assertRaises(UnauthorizedError) as error: self.uc.login(email, password)
            messages.append(str(error.exception))
        with self.repo.administration_lock(): self.repo.update(self.user.id, {"is_active": False})
        with self.assertRaises(UnauthorizedError) as error: self.login()
        messages.append(str(error.exception))
        self.assertEqual(len(set(messages)), 1)

    def test_account_and_origin_limits_are_independent_and_persistent(self):
        limiter = AuthLimiter(self.db, self.auth.secret_key)
        limiter.consume([("account", "one", 1), ("origin", "ip-one", 2)])
        with self.assertRaises(RateLimitError):
            limiter.consume([("account", "one", 1), ("origin", "ip-two", 2)])
        limiter.consume([("account", "two", 1), ("origin", "ip-one", 2)])
        with Session(self.engine) as other, self.assertRaises(RateLimitError) as error:
            AuthLimiter(other, self.auth.secret_key).consume([("account", "three", 1), ("origin", "ip-one", 2)])
        self.assertTrue(1 <= error.exception.retry_after <= 60)
        rows = list(self.db.scalars(select(AuthAttemptModel)))
        self.assertEqual(len(rows), 3)  # Denied requests must not allocate new identities.
        self.assertTrue(all(len(row.key) == 64 for row in rows))

    def test_expired_windows_allow_attempts_again(self):
        limiter = AuthLimiter(self.db, self.auth.secret_key)
        limiter.consume([("account", "one", 1)])
        self.db.execute(text("UPDATE auth_attempts SET expires_at = now() - interval '1 second'"))
        self.db.commit()
        limiter.consume([("account", "one", 1)])
        self.assertEqual(len(list(self.db.scalars(select(AuthAttemptModel)))), 1)

    def test_concurrent_attempts_cannot_exceed_budget(self):
        def attempt(number):
            with Session(self.engine) as db:
                try: AuthLimiter(db, self.auth.secret_key).consume([("account", "concurrent", 3)])
                except RateLimitError: return False
                return True
        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(attempt, range(12))), 3)

    def test_failed_reservation_rolls_back(self):
        with patch.object(self.db, "commit", side_effect=RuntimeError("simulated failure")):
            with self.assertRaises(RuntimeError):
                AuthLimiter(self.db, self.auth.secret_key).consume([("account", "rollback", 1)])
        self.assertEqual(list(self.db.scalars(select(AuthAttemptModel))), [])

    def test_invalid_jwt_configuration_fails_without_exposing_secret(self):
        try:
            for secret in ("", "short", " " * 32, "CHANGE_ME_TO_A_LONG_RANDOM_SECRET"):
                with patch.dict(os.environ, {"JWT_SECRET_KEY": secret}):
                    get_settings.cache_clear()
                    with self.assertRaises(ValueError): get_settings()
            with patch.dict(os.environ, {"JWT_EXPIRE_MINUTES": "0"}):
                get_settings.cache_clear()
                with self.assertRaises(ValueError): get_settings()
        finally:
            get_settings.cache_clear()

    def test_cli_rejects_password_argument_and_invalid_stdin_without_changing_user(self):
        env = {**os.environ, "PGOPTIONS": f"-csearch_path={self.schema}"}
        for arguments, value in ((["legacy-password-argument"], None), (["--password-stdin"], b"short\n")):
            result = subprocess.run([sys.executable, "scripts/reset_admin_password.py", self.user.email,
                *arguments], input=value, capture_output=True, env=env)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(b"legacy-password-argument", result.stderr)
        self.accepted(self.login())
