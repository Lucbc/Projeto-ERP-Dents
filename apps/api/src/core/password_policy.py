"""Policy for newly created passwords; legacy login verification remains compatible."""
from src.core.domain.exceptions import ValidationError

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128


def validate_new_password(password: str) -> None:
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise ValidationError("A senha deve ter entre 8 e 128 caracteres.")
    if "\x00" in password:
        raise ValidationError("A senha contém um caractere inválido.")
    try:
        password.encode("utf-8")
    except UnicodeEncodeError as error:
        raise ValidationError("A senha contém um caractere inválido.") from error
