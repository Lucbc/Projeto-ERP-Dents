from __future__ import annotations

from contextlib import contextmanager
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.orm import Session

from src.adapters.db.models.models import AuthSessionModel, InstallationStateModel, UserModel
from src.core.domain.exceptions import ConflictError
from src.core.domain.entities import User, UserRole
from src.core.ports.repositories import UserRepository


class SqlAlchemyUserRepository(UserRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    @contextmanager
    def administration_lock(self):
        # Serialize user writes through validation + commit. Ordinary SELECTs remain available.
        # Unlike locking only existing admin rows, this also covers role changes and inserts.
        try:
            self.session.execute(text("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"))
            self.session.expire_all()  # Discard identities read before waiting for the lock.
            yield
        finally:
            # Mutations commit inside this repository; failures must release the lock too.
            self.session.rollback()

    def count_active_admins(self) -> int:
        return int(self.session.scalar(select(func.count(UserModel.id)).where(
            UserModel.role == UserRole.admin, UserModel.is_active.is_(True),
        )) or 0)

    def create_session(self, session_id, user_id, expires_at) -> None:
        # Invoked under administration_lock after rechecking the password hash.
        self.session.execute(delete(AuthSessionModel).where(AuthSessionModel.expires_at <= func.now()))
        self.session.add(AuthSessionModel(id=session_id, user_id=user_id, expires_at=expires_at))
        self.session.commit()

    def session_active(self, session_id, user_id) -> bool:
        return self.session.scalar(select(AuthSessionModel.id).where(
            AuthSessionModel.id == session_id, AuthSessionModel.user_id == user_id,
            AuthSessionModel.expires_at > func.now(),
        )) is not None

    def revoke_session(self, session_id, user_id) -> None:
        self.session.execute(delete(AuthSessionModel).where(
            AuthSessionModel.id == session_id, AuthSessionModel.user_id == user_id,
        ))
        self.session.commit()

    def bootstrap_completed(self) -> bool:
        state = self.session.get(InstallationStateModel, 1)
        # Missing state is an installation error, never permission to initialize.
        return state is None or state.bootstrap_completed

    def complete_bootstrap(self, data: dict) -> User:
        # Called under administration_lock; both writes commit together.
        state = self.session.get(InstallationStateModel, 1)
        if state is None or state.bootstrap_completed or self.count_all() != 0:
            raise ConflictError("A configuração inicial já foi concluída ou está indisponível.")
        item = UserModel(**data)
        self.session.add(item)
        state.bootstrap_completed = True
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def count_all(self) -> int:
        return int(self.session.scalar(select(func.count(UserModel.id))) or 0)

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[User], int]:
        stmt = select(UserModel)

        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    UserModel.name.ilike(pattern),
                    UserModel.email.ilike(pattern),
                )
            )

        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.session.scalars(
            stmt.order_by(UserModel.created_at.desc()).limit(limit).offset(offset)
        ).all()
        return [self._to_entity(item) for item in items], int(total)

    def get(self, user_id):
        item = self.session.get(UserModel, user_id)
        return self._to_entity(item) if item else None

    def get_by_email(self, email: str):
        item = self.session.scalar(select(UserModel).where(UserModel.email == email))
        return self._to_entity(item) if item else None

    def create(self, data: dict) -> User:
        item = UserModel(**data)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def update(self, user_id, data: dict):
        item = self.session.get(UserModel, user_id)
        if item is None:
            return None

        if any(key in data and data[key] != getattr(item, key)
               for key in ("password_hash", "is_active", "role", "dentist_id", "email")):
            self.session.execute(delete(AuthSessionModel).where(AuthSessionModel.user_id == user_id))

        for key in ["name", "email", "role", "dentist_id", "password_hash", "is_active"]:
            if key in data:
                setattr(item, key, data[key])

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, user_id) -> bool:
        item = self.session.get(UserModel, user_id)
        if item is None:
            return False

        self.session.delete(item)
        self.session.commit()
        return True

    def _to_entity(self, model: UserModel) -> User:
        return User(
            id=model.id,
            name=model.name,
            email=model.email,
            role=model.role,
            dentist_id=model.dentist_id,
            password_hash=model.password_hash,
            is_active=model.is_active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
