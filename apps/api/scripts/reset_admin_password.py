from __future__ import annotations

import sys
import argparse
import getpass
import warnings
from pathlib import Path

# Support the documented direct invocation from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.adapters.security.jwt_auth_service import JwtAuthService
from src.core.domain.exceptions import ValidationError

from src.adapters.db.database import SessionLocal
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository


class SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse's default error echoes unknown arguments, potentially a legacy plaintext password.
        self.exit(2, "Argumentos invalidos. Informe o email; a senha sera solicitada no terminal.\n")


def main() -> int:
    parser = SafeArgumentParser(description="Redefine a senha e encerra as sessoes da conta.")
    parser.add_argument("email")
    parser.add_argument("--password-stdin", action="store_true",
                        help="Recebe a senha por stdin para automacao; nao use argumentos ou echo.")
    args = parser.parse_args()
    email = args.email.strip().lower()
    if args.password_stdin:
        new_password = sys.stdin.readline(4098).rstrip("\r\n")
    else:
        if not sys.stdin.isatty():
            print("Use um terminal interativo ou --password-stdin para automacao.")
            return 1
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                new_password = getpass.getpass("Nova senha: ")
                confirmation = getpass.getpass("Confirme a nova senha: ")
        except (getpass.GetPassWarning, EOFError):
            print("Nao foi possivel ler a senha de forma oculta. Use um terminal interativo.")
            return 1
        if new_password != confirmation:
            print("As senhas nao coincidem.")
            return 1
    try:
        password_hash = JwtAuthService().hash_password(new_password)
    except ValidationError as error:
        print(str(error))
        return 1
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
