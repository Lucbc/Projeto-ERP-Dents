"""Pure clock/slot rules shared by API validation and scheduling use cases."""
from datetime import datetime, time
from zoneinfo import ZoneInfo
import re
from src.core.domain.exceptions import ValidationError

WEEKDAYS = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
CLOCK_PATTERN = r'(?:[01][0-9]|2[0-3]):[0-5][0-9]'
CLINIC_TIMEZONE = ZoneInfo('America/Sao_Paulo')


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


def clinic_time(value: datetime) -> datetime:
    return value.replace(tzinfo=CLINIC_TIMEZONE) if value.tzinfo is None else value.astimezone(CLINIC_TIMEZONE)


def validate_booking(active: bool, availability: list, start: datetime, end: datetime) -> None:
    if not active:
        raise ValidationError('Dentista inativo. Nao esta disponivel para agendamento.')
    start, end = clinic_time(start), clinic_time(end)
    if end <= start:
        raise ValidationError('Horario final deve ser maior que o horario inicial.')
    if start.date() != end.date():
        raise ValidationError('Consulta deve iniciar e terminar no mesmo dia.')
    day = WEEKDAYS[start.weekday()]
    for slot in availability or []:
        if not isinstance(slot, dict) or slot.get('day_of_week') != day:
            continue
        try:
            opening, closing = validate_slot(day, slot.get('start_time'), slot.get('end_time'))
        except ValueError:
            continue
        if start.time() >= opening and end.time() <= closing:
            return
    raise ValidationError('Dentista nao possui disponibilidade na clinica para este dia/horario.')


def requires_booking_validation(current, values: dict) -> bool:
    """Maintenance retains existing reservations; changed anchors or reopening reserve again."""
    status = values.get('status', current.status if current is not None else 'scheduled')
    if status == 'cancelled':
        return False
    if current is None:
        return True
    if any(values.get(key, getattr(current, key)) != getattr(current, key)
           for key in ('patient_id', 'dentist_id', 'start_at', 'end_at')):
        return True
    return (current.status in ('cancelled', 'completed') and status in ('scheduled', 'confirmed')) or (
        current.status == 'cancelled' and status == 'completed')


def same_availability(first, second) -> bool:
    if first == second:
        return True
    try:
        def slots(value):
            return {(slot['day_of_week'], slot['start_time'], slot['end_time']) for slot in value or []}
        return slots(first) == slots(second)
    except (TypeError, KeyError):
        return False
