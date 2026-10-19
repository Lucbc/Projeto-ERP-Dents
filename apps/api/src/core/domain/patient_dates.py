from datetime import date, datetime, timezone
from src.core.domain.availability import clinic_time
from src.core.domain.exceptions import ValidationError


def validate_birth_date(value: date | None, now: datetime | None = None) -> None:
    today = clinic_time(now if now is not None else datetime.now(timezone.utc)).date()
    if value is not None and value > today:
        raise ValidationError('A data de nascimento não pode estar no futuro. Confira a data ou deixe o campo em branco.')
