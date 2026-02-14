from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from src.core.domain.entities import (
    AppointmentStatus,
    FinancialEntryStatus,
    FinancialEntryType,
    PaymentMethod,
    UserRole,
)


class AppBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(BaseModel):
    detail: str


class PatientCreateRequest(BaseModel):
    full_name: str = Field(min_length=1)
    preferred_name: str | None = None
    birth_date: date | None = None
    cpf: str | None = None
    rg: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = None
    preferred_contact_method: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    insurance_provider: str | None = None
    insurance_plan: str | None = None
    insurance_member_id: str | None = None
    allergies: str | None = None
    medical_history: str | None = None
    notes: str | None = None
    active: bool = True


class PatientUpdateRequest(BaseModel):
    full_name: str | None = None
    preferred_name: str | None = None
    birth_date: date | None = None
    cpf: str | None = None
    rg: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = None
    preferred_contact_method: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    insurance_provider: str | None = None
    insurance_plan: str | None = None
    insurance_member_id: str | None = None
    allergies: str | None = None
    medical_history: str | None = None
    notes: str | None = None
    active: bool | None = None


class PatientResponse(AppBaseSchema):
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


class PatientListResponse(BaseModel):
    items: list[PatientResponse]
    total: int


DayOfWeek = Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


class DentistAvailabilitySlot(BaseModel):
    day_of_week: DayOfWeek
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")

    @model_validator(mode="after")
    def validate_range(self) -> "DentistAvailabilitySlot":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be greater than start_time")
        return self


class DentistCreateRequest(BaseModel):
    full_name: str = Field(min_length=1)
    cro: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    specialty: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    availability: list[DentistAvailabilitySlot] = Field(default_factory=list)
    active: bool = True


class DentistUpdateRequest(BaseModel):
    full_name: str | None = None
    cro: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    specialty: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    availability: list[DentistAvailabilitySlot] | None = None
    active: bool | None = None


class DentistResponse(AppBaseSchema):
    id: UUID
    full_name: str
    cro: str | None
    phone: str | None
    email: str | None
    specialty: str | None
    color: str | None
    availability: list[DentistAvailabilitySlot]
    active: bool
    created_at: datetime
    updated_at: datetime


class DentistListResponse(BaseModel):
    items: list[DentistResponse]
    total: int


class ProcedureCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    price_cents: int | None = Field(default=None, ge=0)
    active: bool = True


class ProcedureUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    price_cents: int | None = Field(default=None, ge=0)
    active: bool | None = None


class ProcedureResponse(AppBaseSchema):
    id: UUID
    name: str
    description: str | None
    duration_minutes: int | None
    price_cents: int | None
    active: bool
    created_at: datetime
    updated_at: datetime


class ProcedureListResponse(BaseModel):
    items: list[ProcedureResponse]
    total: int


class SpecialtyCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    active: bool = True


class SpecialtyUpdateRequest(BaseModel):
    name: str | None = None
    active: bool | None = None


class SpecialtyResponse(AppBaseSchema):
    id: UUID
    name: str
    active: bool
    created_at: datetime
    updated_at: datetime


class SpecialtyListResponse(BaseModel):
    items: list[SpecialtyResponse]
    total: int


class UserCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    role: UserRole
    dentist_id: UUID | None = None
    password: str = Field(min_length=8)
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    role: UserRole | None = None
    dentist_id: UUID | None = None
    is_active: bool | None = None


class SetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8)


class UserResponse(AppBaseSchema):
    id: UUID
    name: str
    email: str
    role: UserRole
    dentist_id: UUID | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int


class PermissionActionSchema(BaseModel):
    view: bool
    create: bool
    update: bool
    delete: bool


class RolePermissionResponse(BaseModel):
    role: UserRole
    permissions: dict[str, PermissionActionSchema]


class RolePermissionListResponse(BaseModel):
    items: list[RolePermissionResponse]


class RolePermissionUpdateRequest(BaseModel):
    permissions: dict[str, PermissionActionSchema]


class AppointmentCreateRequest(BaseModel):
    patient_id: UUID
    dentist_id: UUID
    procedure_ids: list[UUID] = Field(default_factory=list)
    start_at: datetime
    end_at: datetime
    status: AppointmentStatus = AppointmentStatus.scheduled
    notes: str | None = None


class AppointmentUpdateRequest(BaseModel):
    patient_id: UUID | None = None
    dentist_id: UUID | None = None
    procedure_ids: list[UUID] | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    status: AppointmentStatus | None = None
    notes: str | None = None


class AppointmentResponse(AppBaseSchema):
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
    procedure_ids: list[UUID] = Field(default_factory=list)


class FinancialEntryCreateRequest(BaseModel):
    entry_type: FinancialEntryType
    description: str = Field(min_length=1)
    amount_cents: int = Field(ge=0)
    discount_cents: int = Field(default=0, ge=0)
    tax_cents: int = Field(default=0, ge=0)
    due_date: date
    paid_at: datetime | None = None
    status: FinancialEntryStatus = FinancialEntryStatus.pending
    payment_method: PaymentMethod | None = None
    patient_id: UUID | None = None
    dentist_id: UUID | None = None
    appointment_id: UUID | None = None
    procedure_ids: list[UUID] = Field(default_factory=list)
    notes: str | None = None


class FinancialEntryUpdateRequest(BaseModel):
    entry_type: FinancialEntryType | None = None
    description: str | None = None
    amount_cents: int | None = Field(default=None, ge=0)
    discount_cents: int | None = Field(default=None, ge=0)
    tax_cents: int | None = Field(default=None, ge=0)
    due_date: date | None = None
    paid_at: datetime | None = None
    status: FinancialEntryStatus | None = None
    payment_method: PaymentMethod | None = None
    patient_id: UUID | None = None
    dentist_id: UUID | None = None
    appointment_id: UUID | None = None
    procedure_ids: list[UUID] | None = None
    notes: str | None = None


class FinancialGenerateFromAppointmentRequest(BaseModel):
    due_date: date | None = None
    paid_at: datetime | None = None
    status: FinancialEntryStatus = FinancialEntryStatus.pending
    payment_method: PaymentMethod | None = None
    notes: str | None = None


class FinancialMarkPaidRequest(BaseModel):
    paid_at: datetime | None = None
    payment_method: PaymentMethod | None = None


class FinancialEntryResponse(AppBaseSchema):
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
    procedure_ids: list[UUID] = Field(default_factory=list)
    notes: str | None
    patient_name: str | None = None
    dentist_name: str | None = None
    is_overdue: bool = False
    created_at: datetime
    updated_at: datetime


class FinancialEntryListResponse(BaseModel):
    items: list[FinancialEntryResponse]
    total: int


class FinancialSummaryResponse(BaseModel):
    income_total_cents: int
    expense_total_cents: int
    received_cents: int
    paid_expense_cents: int
    pending_income_cents: int
    pending_expense_cents: int
    overdue_income_cents: int
    balance_cents: int
    entries_count: int


class ConsultationPatientSummaryResponse(BaseModel):
    patient: PatientResponse
    next_appointment: AppointmentResponse | None = None


class ConsultationPatientListResponse(BaseModel):
    items: list[ConsultationPatientSummaryResponse]
    total: int


class ConsultationPatientDetailResponse(BaseModel):
    patient: PatientResponse
    next_appointment: AppointmentResponse | None = None
    upcoming_appointments: list[AppointmentResponse]


class ExamResponse(AppBaseSchema):
    id: UUID
    patient_id: UUID
    original_filename: str
    stored_filename: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime
    notes: str | None


class NeedsBootstrapResponse(BaseModel):
    needsBootstrap: bool


class BootstrapAdminRequest(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    detail: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
