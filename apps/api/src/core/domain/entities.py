from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from uuid import UUID


class UserRole(str, Enum):
    admin = "admin"
    receptionist = "receptionist"
    dentist = "dentist"


class AppointmentStatus(str, Enum):
    scheduled = "scheduled"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"


@dataclass(slots=True)
class Patient:
    id: UUID
    full_name: str
    birth_date: date | None
    cpf: str | None
    phone: str | None
    email: str | None
    address: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class Dentist:
    id: UUID
    full_name: str
    cro: str | None
    phone: str | None
    email: str | None
    active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class User:
    id: UUID
    name: str
    email: str
    role: UserRole
    dentist_id: UUID | None
    password_hash: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class Appointment:
    id: UUID
    patient_id: UUID
    dentist_id: UUID
    start_at: datetime
    end_at: datetime
    status: AppointmentStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime
    patient_name: str | None = None
    dentist_name: str | None = None


@dataclass(slots=True)
class Exam:
    id: UUID
    patient_id: UUID
    original_filename: str
    stored_filename: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime
    notes: str | None
