from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from src.core.domain.entities import AppointmentStatus, UserRole


class AppBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorResponse(BaseModel):
    detail: str


class PatientCreateRequest(BaseModel):
    full_name: str = Field(min_length=1)
    birth_date: date | None = None
    cpf: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = None
    notes: str | None = None


class PatientUpdateRequest(BaseModel):
    full_name: str | None = None
    birth_date: date | None = None
    cpf: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = None
    notes: str | None = None


class PatientResponse(AppBaseSchema):
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


class PatientListResponse(BaseModel):
    items: list[PatientResponse]
    total: int


class DentistCreateRequest(BaseModel):
    full_name: str = Field(min_length=1)
    cro: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    active: bool = True


class DentistUpdateRequest(BaseModel):
    full_name: str | None = None
    cro: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    active: bool | None = None


class DentistResponse(AppBaseSchema):
    id: UUID
    full_name: str
    cro: str | None
    phone: str | None
    email: str | None
    active: bool
    created_at: datetime
    updated_at: datetime


class DentistListResponse(BaseModel):
    items: list[DentistResponse]
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


class AppointmentCreateRequest(BaseModel):
    patient_id: UUID
    dentist_id: UUID
    start_at: datetime
    end_at: datetime
    status: AppointmentStatus = AppointmentStatus.scheduled
    notes: str | None = None


class AppointmentUpdateRequest(BaseModel):
    patient_id: UUID | None = None
    dentist_id: UUID | None = None
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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
