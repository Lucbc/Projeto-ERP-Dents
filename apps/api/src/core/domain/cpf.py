"""CPF format/check digits only; this does not establish ownership or registration."""
import re
from src.core.domain.exceptions import ValidationError


def cpf_digits(value):
    if not value or not re.fullmatch(r'[0-9.\s-]+', value):
        return None
    digits = re.sub(r'[^0-9]', '', value)
    return digits if len(digits) == 11 else None


def same_cpf(value, original):
    if (value or '').strip() == (original or '').strip():
        return True
    key = cpf_digits(value)
    return key is not None and key == cpf_digits(original)


def validate_cpf(value):
    if value is None or not value.strip():
        return
    digits = cpf_digits(value)
    valid = digits is not None and len(set(digits)) > 1
    if valid:
        for length in (9, 10):
            remainder = sum(int(digits[i]) * (length + 1 - i) for i in range(length)) % 11
            if int(digits[length]) != (0 if remainder < 2 else 11 - remainder):
                valid = False
                break
    if not valid:
        raise ValidationError('CPF inválido. Confira os 11 dígitos ou deixe o campo em branco.')
