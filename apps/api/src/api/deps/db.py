from sqlalchemy.orm import Session

from src.adapters.db.database import get_db_session


def get_db_dep() -> Session:
    yield from get_db_session()
