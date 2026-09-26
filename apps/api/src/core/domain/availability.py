"""Pure clock/slot rules shared by API validation and scheduling use cases."""
from datetime import time
import re

WEEKDAYS = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
CLOCK_PATTERN = r'(?:[01][0-9]|2[0-3]):[0-5][0-9]'


def parse_clock(value: object) -> time:
    if not isinstance(value, str) or re.fullmatch(CLOCK_PATTERN, value) is None:
        raise ValueError('Informe um horário válido no formato HH:MM, de 00:00 a 23:59.')
    return time(int(value[:2]), int(value[3:]))


def validate_slot(day: object, start: object, end: object) -> tuple[time, time]:
    if day not in WEEKDAYS:
        raise ValueError('Informe um dia da semana válido.')
    start_clock, end_clock = parse_clock(start), parse_clock(end)
    if end_clock <= start_clock:
        raise ValueError('O horário final deve ser maior que o inicial.')
    return start_clock, end_clock
