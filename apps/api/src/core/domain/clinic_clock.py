"""Current civil day of the clinic, independent of the server's timezone."""
from datetime import date, datetime, timezone

from src.core.domain.availability import clinic_time


def clinic_today() -> date:
    return clinic_time(datetime.now(timezone.utc)).date()
