from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from src.adapters.db.repositories.appointment_repository import SqlAlchemyAppointmentRepository
from src.adapters.db.repositories.dentist_repository import SqlAlchemyDentistRepository
from src.adapters.db.repositories.financial_repository import SqlAlchemyFinancialRepository
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.adapters.db.repositories.procedure_repository import SqlAlchemyProcedureRepository
from src.api.deps.auth import require_permission
from src.api.deps.db import get_db_dep
from src.api.schemas.schemas import (
    FinancialEntryCreateRequest,
    FinancialEntryListResponse,
    FinancialEntryResponse,
    FinancialEntryUpdateRequest,
    FinancialGenerateFromAppointmentRequest,
    FinancialMarkPaidRequest,
    FinancialReverseRequest,
    FinancialOperationResponse,
    FinancialSummaryResponse,
)
from src.core.use_cases.financial_use_cases import FinancialUseCases
from src.core.domain.entities import User, FinancialEntryStatus

router = APIRouter(
    prefix="/api/financial",
    tags=["financial"],
)


def build_use_case(db: Session) -> FinancialUseCases:
    return FinancialUseCases(
        financial_repository=SqlAlchemyFinancialRepository(db),
        appointment_repository=SqlAlchemyAppointmentRepository(db),
        patient_repository=SqlAlchemyPatientRepository(db),
        dentist_repository=SqlAlchemyDentistRepository(db),
        procedure_repository=SqlAlchemyProcedureRepository(db),
    )


@router.get(
    "",
    response_model=FinancialEntryListResponse,
    dependencies=[Depends(require_permission("financial", "view"))],
)
def list_financial_entries(
    search: str | None = None,
    entry_type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    dt_from: date | None = Query(default=None, alias="from"),
    dt_to: date | None = Query(default=None, alias="to"),
    patient_id: UUID | None = None,
    dentist_id: UUID | None = None,
    appointment_id: UUID | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_dep),
) -> FinancialEntryListResponse:
    use_case = build_use_case(db)
    items, total = use_case.list(
        search=search,
        entry_type=entry_type,
        status=status_filter,
        dt_from=dt_from,
        dt_to=dt_to,
        patient_id=patient_id,
        dentist_id=dentist_id,
        appointment_id=appointment_id,
        limit=limit,
        offset=offset,
    )
    return FinancialEntryListResponse(
        items=[FinancialEntryResponse.model_validate(item) for item in items],
        total=total,
    )


@router.get(
    "/summary",
    response_model=FinancialSummaryResponse,
    dependencies=[Depends(require_permission("financial", "view"))],
)
def get_financial_summary(
    dt_from: date | None = Query(default=None, alias="from"),
    dt_to: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    return use_case.summarize(dt_from=dt_from, dt_to=dt_to)


@router.post(
    "",
    response_model=FinancialEntryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("financial", "create"))],
)
def create_financial_entry(payload: FinancialEntryCreateRequest, db: Session = Depends(get_db_dep),
                           actor: User = Depends(require_permission("financial", "create"))):
    if payload.status == FinancialEntryStatus.paid:
        require_permission("financial", "update")(current_user=actor, db=db)
    use_case = build_use_case(db)
    return use_case.create(payload.model_dump(), actor=actor)


@router.post(
    "/from-appointment/{appointment_id}",
    response_model=FinancialEntryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("financial", "create"))],
)
def generate_financial_from_appointment(
    appointment_id: UUID,
    payload: FinancialGenerateFromAppointmentRequest,
    actor: User = Depends(require_permission("financial", "create")),
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    if payload.status == FinancialEntryStatus.paid:
        require_permission("financial", "update")(current_user=actor, db=db)
    return use_case.generate_from_appointment(appointment_id=appointment_id, data=payload.model_dump(), actor=actor)


@router.get(
    "/{financial_entry_id}",
    response_model=FinancialEntryResponse,
    dependencies=[Depends(require_permission("financial", "view"))],
)
def get_financial_entry(financial_entry_id: UUID, db: Session = Depends(get_db_dep)):
    use_case = build_use_case(db)
    return use_case.get(financial_entry_id)


@router.put(
    "/{financial_entry_id}",
    response_model=FinancialEntryResponse,
    dependencies=[Depends(require_permission("financial", "update"))],
)
def update_financial_entry(
    financial_entry_id: UUID,
    payload: FinancialEntryUpdateRequest,
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    return use_case.update(financial_entry_id, payload.model_dump(exclude_unset=True))


@router.post(
    "/{financial_entry_id}/mark-paid",
    response_model=FinancialOperationResponse,
    dependencies=[Depends(require_permission("financial", "update"))],
)
def mark_financial_entry_paid(
    financial_entry_id: UUID,
    payload: FinancialMarkPaidRequest,
    actor: User = Depends(require_permission("financial", "update")),
    db: Session = Depends(get_db_dep),
):
    use_case = build_use_case(db)
    return use_case.mark_as_paid(
        financial_entry_id=financial_entry_id,
        version=payload.version,
        idempotency_key=payload.idempotency_key,
        actor=actor,
        paid_at=payload.paid_at,
        payment_method=payload.payment_method,
    )


@router.delete(
    "/{financial_entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(require_permission("financial", "delete"))],
)
def delete_financial_entry(financial_entry_id: UUID, version: int = Query(gt=0), db: Session = Depends(get_db_dep)) -> Response:
    use_case = build_use_case(db)
    use_case.delete(financial_entry_id, version)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{financial_entry_id}/payments", dependencies=[Depends(require_permission("financial", "view"))])
def financial_payments(financial_entry_id: UUID, db: Session = Depends(get_db_dep)):
    return build_use_case(db).payments(financial_entry_id)


@router.post("/{financial_entry_id}/reverse-payment", response_model=FinancialOperationResponse,
             dependencies=[Depends(require_permission("financial", "update"))])
def reverse_financial_payment(financial_entry_id: UUID, payload: FinancialReverseRequest,
                              actor: User = Depends(require_permission("financial_reversals", "create")),
                              db: Session = Depends(get_db_dep)):
    return build_use_case(db).reverse_payment(financial_entry_id, payload.version, payload.payment_id,
                                            payload.idempotency_key, payload.reason, actor)
