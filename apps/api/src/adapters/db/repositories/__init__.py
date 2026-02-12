from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.adapters.db.models.models import UserModel
from src.core.domain.entities import User
from src.core.ports.repositories import UserRepository


class SqlAlchemyUserRepository(UserRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

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

