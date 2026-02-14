from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from uuid import UUID


class UserRole(str, Enum):
    admin = "admin"
    coordinator = "coordinator"
    dentist = "dentist"
    reception = "reception"


class AppointmentStatus(str, Enum):
    scheduled = "scheduled"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"


class FinancialEntryType(str, Enum):
    income = "income"
    expense = "expense"


class FinancialEntryStatus(str, Enum):
    pending = "pending"
    paid = "paid"
    cancelled = "cancelled"


class PaymentMethod(str, Enum):
    cash = "cash"
    pix = "pix"
    credit_card = "credit_card"
    debit_card = "debit_card"
    bank_transfer = "bank_transfer"
    boleto = "boleto"
    insurance = "insurance"
    other = "other"


@dataclass(slots=True)
class Patient:
    id: UUID
    full_name: str
    preferred_name: str | None
    birth_date: date | None
    cpf: str | None
    rg: str | None
    phone: str | None
    email: str | None
    address: str | None
    preferred_contact_method: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    insurance_provider: str | None
    insurance_plan: str | None
    insurance_member_id: str | None
    allergies: str | None
    medical_history: str | None
    notes: str | None
    active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class Dentist:
    id: UUID
    full_name: str
    cro: str | None
    phone: str | None
    email: str | None
    specialty: str | None
    color: str | None
    availability: list[dict[str, str]]
    active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class Procedure:
    id: UUID
    name: str
    description: str | None
    duration_minutes: int | None
    price_cents: int | None
    active: bool
    created_at: datetime
    updated_at: datetime


@dataclass(slots=True)
class Specialty:
    id: UUID
    name: str
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
class RolePermission:
    role: UserRole
    permissions: dict[str, dict[str, bool]]
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
    procedure_ids: list[UUID] = field(default_factory=list)


@dataclass(slots=True)
class FinancialEntry:
    id: UUID
    entry_type: FinancialEntryType
    description: str
    amount_cents: int
    discount_cents: int
    tax_cents: int
    total_cents: int
    due_date: date
    paid_at: datetime | None
    status: FinancialEntryStatus
    payment_method: PaymentMethod | None
    patient_id: UUID | None
    dentist_id: UUID | None
    appointment_id: UUID | None
    procedure_ids: list[UUID]
    notes: str | None
    created_at: datetime
    updated_at: datetime
    patient_name: str | None = None
    dentist_name: str | None = None
    is_overdue: bool = False


@dataclass(slots=True)
class FinancialSummary:
    income_total_cents: int
    expense_total_cents: int
    received_cents: int
    paid_expense_cents: int
    pending_income_cents: int
    pending_expense_cents: int
    overdue_income_cents: int
    balance_cents: int
    entries_count: int


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
