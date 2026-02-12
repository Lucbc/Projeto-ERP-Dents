from __future__ import annotations

import sys

from passlib.context import CryptContext
from sqlalchemy import select

from src.adapters.db.database import SessionLocal
from src.adapters.db.models.models import UserModel


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

    with SessionLocal() as session:
        user = session.scalar(select(UserModel).where(UserModel.email == email))
        if user is None:
            print("Erro: usuário não encontrado.")
            return 1

        user.password_hash = pwd_context.hash(new_password)
        session.commit()

    print("Senha redefinida com sucesso.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
