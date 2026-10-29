from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


Version = Annotated[int, Field(strict=True, ge=1, lt=2**63 - 1)]
ClinicalText = Annotated[str, Field(strict=True, max_length=50000)]


class ClinicalDraftRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    key: UUID
    text: ClinicalText
    expected_patient_id: UUID | None = None
    appointment_version: Version | None = None


class ClinicalSaveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    key: UUID
    text: ClinicalText
    version: Version


class ClinicalFinalizeRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    key: UUID
    version: Version


class ClinicalAddendumRequest(ClinicalSaveRequest):
    reason: Annotated[str, Field(strict=True, min_length=1, max_length=5000)]


class ClinicalContextResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    allergies: str | None
    medical_history: str | None


class ClinicalAddendumResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    author_id: UUID
    author_name: str
    dentist_id: UUID
    text: str
    reason: str
    recorded_at: datetime


class ClinicalRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    appointment_id: UUID
    patient_id: UUID
    dentist_id: UUID
    author_id: UUID
    author_name: str
    text: str
    version: int
    created_at: datetime
    updated_at: datetime
    finalized_at: datetime | None
    context: ClinicalContextResponse | None
    addenda: list[ClinicalAddendumResponse]


class ClinicalRecordListResponse(BaseModel):
    items: list[ClinicalRecordResponse]
    total: int
