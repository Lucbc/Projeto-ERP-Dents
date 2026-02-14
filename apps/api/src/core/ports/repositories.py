from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date, datetime
from uuid import UUID

from src.core.domain.entities import (
    Appointment,
    Dentist,
    Exam,
    FinancialEntry,
    FinancialSummary,
    Patient,
    Specialty,
    Procedure,
    RolePermission,
    User,
    UserRole,
)


class PatientRepository(ABC):
    @abstractmethod
    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Patient], int]: ...

    @abstractmethod
    def get(self, patient_id: UUID) -> Patient | None: ...

    @abstractmethod
    def create(self, data: dict) -> Patient: ...

    @abstractmethod
    def update(self, patient_id: UUID, data: dict) -> Patient | None: ...

    @abstractmethod
    def delete(self, patient_id: UUID) -> bool: ...


class DentistRepository(ABC):
    @abstractmethod
    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Dentist], int]: ...

    @abstractmethod
    def get(self, dentist_id: UUID) -> Dentist | None: ...

    @abstractmethod
    def create(self, data: dict) -> Dentist: ...

    @abstractmethod
    def update(self, dentist_id: UUID, data: dict) -> Dentist | None: ...

    @abstractmethod
    def delete(self, dentist_id: UUID) -> bool: ...


class ProcedureRepository(ABC):
    @abstractmethod
    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Procedure], int]: ...

    @abstractmethod
    def get(self, procedure_id: UUID) -> Procedure | None: ...

    @abstractmethod
    def create(self, data: dict) -> Procedure: ...

    @abstractmethod
    def update(self, procedure_id: UUID, data: dict) -> Procedure | None: ...

    @abstractmethod
    def delete(self, procedure_id: UUID) -> bool: ...


class SpecialtyRepository(ABC):
    @abstractmethod
    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Specialty], int]: ...

    @abstractmethod
    def get(self, specialty_id: UUID) -> Specialty | None: ...

    @abstractmethod
    def create(self, data: dict) -> Specialty: ...

    @abstractmethod
    def update(self, specialty_id: UUID, data: dict) -> Specialty | None: ...

    @abstractmethod
    def delete(self, specialty_id: UUID) -> bool: ...


class UserRepository(ABC):
    @abstractmethod
    def count_all(self) -> int: ...

    @abstractmethod
    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[User], int]: ...

    @abstractmethod
    def get(self, user_id: UUID) -> User | None: ...

    @abstractmethod
    def get_by_email(self, email: str) -> User | None: ...

    @abstractmethod
    def create(self, data: dict) -> User: ...

    @abstractmethod
    def update(self, user_id: UUID, data: dict) -> User | None: ...

    @abstractmethod
    def delete(self, user_id: UUID) -> bool: ...


class RolePermissionRepository(ABC):
    @abstractmethod
    def get_by_role(self, role: UserRole) -> RolePermission | None: ...

    @abstractmethod
    def list_all(self) -> list[RolePermission]: ...

    @abstractmethod
    def upsert(self, role: UserRole, permissions: dict[str, dict[str, bool]]) -> RolePermission: ...


class AppointmentRepository(ABC):
    @abstractmethod
    def list(
        self,
        dt_from: datetime | None,
        dt_to: datetime | None,
        dentist_id: UUID | None,
        patient_id: UUID | None,
    ) -> list[Appointment]: ...

    @abstractmethod
    def get(self, appointment_id: UUID) -> Appointment | None: ...

    @abstractmethod
    def has_conflict(
        self,
        start_at: datetime,
        end_at: datetime,
        dentist_id: UUID | None = None,
        patient_id: UUID | None = None,
        exclude_appointment_id: UUID | None = None,
    ) -> bool: ...

    @abstractmethod
    def create(self, data: dict) -> Appointment: ...

    @abstractmethod
    def update(self, appointment_id: UUID, data: dict) -> Appointment | None: ...

    @abstractmethod
    def delete(self, appointment_id: UUID) -> bool: ...


class ExamRepository(ABC):
    @abstractmethod
    def list_by_patient(self, patient_id: UUID) -> list[Exam]: ...

    @abstractmethod
    def get(self, exam_id: UUID) -> Exam | None: ...

    @abstractmethod
    def create(self, data: dict) -> Exam: ...

    @abstractmethod
    def delete(self, exam_id: UUID) -> bool: ...


class FinancialRepository(ABC):
    @abstractmethod
    def list(
        self,
        search: str | None,
        entry_type: str | None,
        status: str | None,
        dt_from: date | None,
        dt_to: date | None,
        patient_id: UUID | None,
        dentist_id: UUID | None,
        appointment_id: UUID | None,
        limit: int,
        offset: int,
    ) -> tuple[list[FinancialEntry], int]: ...

    @abstractmethod
    def get(self, financial_entry_id: UUID) -> FinancialEntry | None: ...

    @abstractmethod
    def get_by_appointment(self, appointment_id: UUID) -> FinancialEntry | None: ...

    @abstractmethod
    def create(self, data: dict) -> FinancialEntry: ...

    @abstractmethod
    def update(self, financial_entry_id: UUID, data: dict) -> FinancialEntry | None: ...

    @abstractmethod
    def delete(self, financial_entry_id: UUID) -> bool: ...

    @abstractmethod
    def summarize(self, dt_from: date | None, dt_to: date | None) -> FinancialSummary: ...

