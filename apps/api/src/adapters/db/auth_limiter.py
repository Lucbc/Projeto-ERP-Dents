"""Short serialized reservations; never hold the lock while hashing a password."""
from datetime import timedelta
import hashlib
import hmac
import math

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from src.adapters.db.models.models import AuthAttemptModel
from src.core.domain.exceptions import RateLimitError


class AuthLimiter:
    def __init__(self, db: Session, secret: str):
        self.db = db
        self.secret = secret.encode()

    def consume(self, budgets: list[tuple[str, str, int]], window_seconds: int = 60) -> None:
        """Count all attempts, including successes, with independent budgets."""
        retry_after = 0
        try:
            self.db.execute(text("LOCK TABLE auth_attempts IN SHARE ROW EXCLUSIVE MODE"))
            self.db.expire_all()
            now = self.db.scalar(select(func.clock_timestamp()))
            self.db.execute(delete(AuthAttemptModel).where(AuthAttemptModel.expires_at <= now))
            rows = []
            for scope, identity, limit in budgets:
                key = hmac.new(self.secret, (scope + ":" + identity).encode(), hashlib.sha256).hexdigest()
                row = self.db.get(AuthAttemptModel, key)
                if row is None:
                    row = AuthAttemptModel(key=key, attempts=0, expires_at=now + timedelta(seconds=window_seconds))
                if row.attempts >= limit:
                    retry_after = max(retry_after, math.ceil((row.expires_at - now).total_seconds()))
                rows.append(row)
            if not retry_after:
                for row in rows:
                    row.attempts += 1
                    self.db.add(row)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        if retry_after:
            raise RateLimitError(retry_after)
