from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.adapters.db.repositories.clinical_record_repository import SqlAlchemyClinicalRecordRepository
from src.api.deps.auth import get_current_session_id, get_current_user
from src.api.deps.db import get_db_dep
from src.api.schemas.clinical_records import (
    ClinicalAddendumRequest, ClinicalDraftRequest, ClinicalFinalizeRequest,
    ClinicalRecordListResponse, ClinicalRecordResponse, ClinicalSaveRequest,
)
from src.core.domain.entities import User

router = APIRouter(prefix='/api/clinical-records', tags=['clinical-records'])


def access(db: Session = Depends(get_db_dep), actor: User = Depends(get_current_user),
           session_id: UUID = Depends(get_current_session_id)):
    # Repository rereads the actor, session and grants inside the same lock as
    # permission changes/revocations, before loading any clinical content.
    return SqlAlchemyClinicalRecordRepository(db), {'actor_id': actor.id, 'session_id': session_id}


@router.get('', response_model=ClinicalRecordListResponse)
def list_records(patient_id: UUID, limit: int = Query(20, ge=1, le=100),
                 offset: int = Query(0, ge=0), auth=Depends(access)):
    repository, identity = auth
    return repository.list_for_patient(patient_id, limit=limit, offset=offset, **identity)


@router.get('/{record_id}', response_model=ClinicalRecordResponse)
def get_record(record_id: UUID, auth=Depends(access)):
    repository, identity = auth
    return repository.get(record_id, **identity)


@router.get('/from-appointment/{appointment_id}', response_model=ClinicalRecordResponse | None)
def get_appointment_record(appointment_id: UUID, auth=Depends(access)):
    repository, identity = auth
    return repository.get_for_appointment(appointment_id, **identity)


@router.post('/from-appointment/{appointment_id}', response_model=ClinicalRecordResponse, status_code=201)
def create_record(appointment_id: UUID, payload: ClinicalDraftRequest, auth=Depends(access)):
    repository, identity = auth
    return repository.execute('create', appointment_id, **identity, **payload.model_dump())


@router.put('/{record_id}', response_model=ClinicalRecordResponse)
def save_record(record_id: UUID, payload: ClinicalSaveRequest, auth=Depends(access)):
    repository, identity = auth
    return repository.execute('save', record_id, **identity, **payload.model_dump())


@router.post('/{record_id}/finalize', response_model=ClinicalRecordResponse)
def finalize_record(record_id: UUID, payload: ClinicalFinalizeRequest, auth=Depends(access)):
    repository, identity = auth
    return repository.execute('finalize', record_id, **identity, **payload.model_dump())


@router.post('/{record_id}/addenda', response_model=ClinicalRecordResponse)
def add_addendum(record_id: UUID, payload: ClinicalAddendumRequest, auth=Depends(access)):
    repository, identity = auth
    return repository.execute('addendum', record_id, **identity, **payload.model_dump())
