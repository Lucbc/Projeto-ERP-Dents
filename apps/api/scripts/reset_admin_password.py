from __future__ import annotations

import sys
from pathlib import Path

# Support the documented direct invocation from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from passlib.context import CryptContext

from src.adapters.db.database import SessionLocal
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def main() -> int:
    if len(sys.argv) != 3:
        print("Uso: python scripts/reset_admin_password.py <email> <nova_senha>")
        return 1

    email = sys.argv[1].strip().lower()
    new_password = sys.argv[2]

    if len(new_password) < 8:
        print("Erro: a nova senha deve ter no mínimo 8 caracteres.")
        return 1

    password_hash = pwd_context.hash(new_password)
    with SessionLocal() as session:
        repository = SqlAlchemyUserRepository(session)
        with repository.administration_lock():
            user = repository.get_by_email(email)
            if user is None:
                print("Erro: usuario nao encontrado.")
                return 1
            repository.update(user.id, {"password_hash": password_hash})

    print("Senha redefinida com sucesso.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
