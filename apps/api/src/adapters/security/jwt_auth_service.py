from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from functools import lru_cache

import jwt
from jwt import InvalidTokenError
from passlib.context import CryptContext

from src.config import get_settings
from src.core.ports.services import AuthService
from src.core.password_policy import validate_new_password


@lru_cache(maxsize=1)
def password_context() -> CryptContext:
    return CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated="auto")


@lru_cache(maxsize=1)
def dummy_hash() -> str:
    return password_context().hash("dummy-password-never-used-for-login")


class JwtAuthService(AuthService):
    def __init__(self) -> None:
        settings = get_settings()
        self.secret_key = settings.jwt_secret_key
        self.expire_minutes = settings.jwt_expire_minutes
        self.algorithm = "HS256"
        self.pwd_context = password_context()

    def hash_password(self, password: str) -> str:
        validate_new_password(password)
        return self.pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        if len(plain_password) > 4096 or "\x00" in plain_password:
            return False
        try:
            valid_hash = bool(self.pwd_context.identify(hashed_password))
            valid = self.pwd_context.verify(plain_password, hashed_password if valid_hash else dummy_hash())
            return valid and valid_hash
        except (ValueError, TypeError):
            return False

    def create_access_token(self, subject: str, extra_claims: dict[str, Any] | None = None) -> str:
        now = datetime.now(timezone.utc)
        payload: dict[str, Any] = {
            "sub": subject,
            "transport": "cookie-v1",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=self.expire_minutes)).timestamp()),
        }
        if extra_claims:
            payload.update(extra_claims)
        return jwt.encode(payload, self.secret_key, algorithm=self.algorithm)

    def decode_access_token(self, token: str) -> dict[str, Any] | None:
        try:
            return jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
        except InvalidTokenError:
            return None
