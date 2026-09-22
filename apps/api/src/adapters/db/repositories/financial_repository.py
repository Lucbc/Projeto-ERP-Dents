from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select, update, delete, text
from .financial_history import FinancialHistoryMixin
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from src.adapters.db.models.models import DentistModel, FinancialEntryModel, FinancialGenerationModel, PatientModel
from src.core.domain.exceptions import ConflictError, ValidationError
from src.core.domain.entities import (
    FinancialEntry,
    FinancialEntryStatus,
    FinancialEntryType,
    FinancialSummary,
)
from src.core.ports.repositories import FinancialRepository


class SqlAlchemyFinancialRepository(FinancialHistoryMixin, FinancialRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

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
    ) -> tuple[list[FinancialEntry], int]:
        stmt = (
            select(FinancialEntryModel, PatientModel.full_name, DentistModel.full_name)
            .outerjoin(PatientModel, FinancialEntryModel.patient_id == PatientModel.id)
            .outerjoin(DentistModel, FinancialEntryModel.dentist_id == DentistModel.id)
        )

        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    FinancialEntryModel.description.ilike(pattern),
                    FinancialEntryModel.notes.ilike(pattern),
                    PatientModel.full_name.ilike(pattern),
                    DentistModel.full_name.ilike(pattern),
                )
            )

        if entry_type:
            stmt = stmt.where(FinancialEntryModel.entry_type == entry_type)
        if status:
            stmt = stmt.where(FinancialEntryModel.status == status)
        if dt_from is not None:
            stmt = stmt.where(FinancialEntryModel.due_date >= dt_from)
        if dt_to is not None:
            stmt = stmt.where(FinancialEntryModel.due_date <= dt_to)
        if patient_id is not None:
            stmt = stmt.where(FinancialEntryModel.patient_id == patient_id)
        if dentist_id is not None:
            stmt = stmt.where(FinancialEntryModel.dentist_id == dentist_id)
        if appointment_id is not None:
            stmt = stmt.where(FinancialEntryModel.appointment_id == appointment_id)

        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        rows = self.session.execute(
            stmt.order_by(FinancialEntryModel.due_date.desc(), FinancialEntryModel.created_at.desc())
            .limit(limit)
            .offset(offset)
        ).all()

        return [self._to_entity(row[0], patient_name=row[1], dentist_name=row[2]) for row in rows], int(total)

    def get(self, financial_entry_id):
        row = self.session.execute(
            select(FinancialEntryModel, PatientModel.full_name, DentistModel.full_name)
            .outerjoin(PatientModel, FinancialEntryModel.patient_id == PatientModel.id)
            .outerjoin(DentistModel, FinancialEntryModel.dentist_id == DentistModel.id)
            .where(FinancialEntryModel.id == financial_entry_id)
        ).first()

        if row is None:
            return None
        return self._to_entity(row[0], patient_name=row[1], dentist_name=row[2])

    def get_by_appointment(self, appointment_id: UUID) -> FinancialEntry | None:
        row = self.session.execute(
            select(FinancialEntryModel, PatientModel.full_name, DentistModel.full_name)
            .outerjoin(PatientModel, FinancialEntryModel.patient_id == PatientModel.id)
            .outerjoin(DentistModel, FinancialEntryModel.dentist_id == DentistModel.id)
            .where(
                FinancialEntryModel.appointment_id == appointment_id,
                FinancialEntryModel.status != FinancialEntryStatus.cancelled,
            )
            .order_by(FinancialEntryModel.created_at.desc())
        ).first()

        if row is None:
            return None
        return self._to_entity(row[0], patient_name=row[1], dentist_name=row[2])

    def get_generation(self, key: UUID, request_hash: str) -> FinancialEntry | None:
        receipt = self.session.get(FinancialGenerationModel, key)
        if receipt is None:
            return None
        if receipt.request_hash != request_hash:
            raise ConflictError("Esta chave de repeticao ja foi usada com outros dados.")
        entry = self.get(receipt.entry_id) if receipt.entry_id else None
        if entry is None:
            raise ConflictError("O lancamento desta operacao foi excluido. Atualize o financeiro antes de continuar.")
        return entry

    def create_generated(self, data: dict, key: UUID | None, request_hash: str) -> FinancialEntry:
        try:
            item = FinancialEntryModel(**data)
            self.session.add(item)
            self.session.flush()
            if key is not None:
                self.session.add(FinancialGenerationModel(key=key, request_hash=request_hash, entry_id=item.id))
            self.session.commit()
            self.session.refresh(item)
            return self._to_entity(item)
        except IntegrityError as exc:
            self.session.rollback()
            constraint = getattr(getattr(exc.orig, 'diag', None), 'constraint_name', None)
            if getattr(exc.orig, 'sqlstate', None) != '23505' or constraint not in (
                'uq_financial_active_appointment', 'financial_generations_pkey'):
                raise
            existing = self.get_generation(key, request_hash) if key is not None else None
            if existing is not None:
                return existing
            raise ConflictError("A consulta ja possui um lancamento financeiro ativo.") from None

    def create(self, data: dict) -> FinancialEntry:
        item = FinancialEntryModel(**data)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    @staticmethod
    def _validate_version(version):
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra o lançamento para obter a versão atual.")

    def _missing_or_conflict(self, id, version):
        self.session.rollback()
        current = self.session.execute(select(FinancialEntryModel.version).where(FinancialEntryModel.id == id)).first()
        self.session.rollback()
        if current is None:
            return None
        if current.version != version:
            raise ConflictError("Este lançamento foi alterado por outra operação. Recarregue os dados antes de confirmar novamente.", code="stale_version")
        raise ConflictError("Este lançamento não está pendente. Recarregue o financeiro e confira o pagamento.", code="financial_state_conflict")

    def update(self, financial_entry_id, data: dict, *, pending_only: bool = False):
        version = data.get("version")
        self._validate_version(version)
        current = self._locked_entry(financial_entry_id, version)
        if current.status == FinancialEntryStatus.paid or data.get('status') in ('paid', FinancialEntryStatus.paid):
            self.session.rollback()
            raise ConflictError('Pagamento confirmado exige estorno antes de editar.', code='payment_immutable')
        values = {key: data[key] for key in (
            "entry_type", "description", "amount_cents", "discount_cents", "tax_cents", "total_cents",
            "due_date", "paid_at", "status", "payment_method", "patient_id", "dentist_id",
            "appointment_id", "procedure_ids", "notes") if key in data}
        stmt = update(FinancialEntryModel).where(FinancialEntryModel.id == financial_entry_id,
            FinancialEntryModel.version == version)
        if pending_only:
            stmt = stmt.where(FinancialEntryModel.status == FinancialEntryStatus.pending)
        try:
            item = self.session.scalar(stmt.values(**values, version=FinancialEntryModel.version + 1)
                .returning(FinancialEntryModel), execution_options={'populate_existing': True})
            if item is None:
                return self._missing_or_conflict(financial_entry_id, version)
            self.session.commit()
        except IntegrityError:
            self.session.rollback()
            raise
        self.session.refresh(item)
        return self._to_entity(item)

    def delete(self, financial_entry_id, version: int) -> bool:
        self._validate_version(version)
        current = self._locked_entry(financial_entry_id, version)
        if current.status == FinancialEntryStatus.paid or self.payments(financial_entry_id):
            self.session.rollback()
            raise ConflictError('Lançamento com pagamentos não pode ser excluído. Use estorno e cancelamento.', code='payment_immutable')
        removed = self.session.scalar(delete(FinancialEntryModel).where(
            FinancialEntryModel.id == financial_entry_id, FinancialEntryModel.version == version
        ).returning(FinancialEntryModel.id))
        if removed is None:
            self._missing_or_conflict(financial_entry_id, version)
            return False
        self.session.commit()
        return True

    def summarize(self, dt_from: date | None, dt_to: date | None) -> FinancialSummary:
        stmt = select(
            FinancialEntryModel.entry_type,
            FinancialEntryModel.status,
            FinancialEntryModel.total_cents,
            FinancialEntryModel.due_date,
        )
        if dt_from is not None:
            stmt = stmt.where(FinancialEntryModel.due_date >= dt_from)
        if dt_to is not None:
            stmt = stmt.where(FinancialEntryModel.due_date <= dt_to)

        rows = self.session.execute(stmt).all()
        today = date.today()

        income_total_cents = 0
        expense_total_cents = 0
        received_cents = 0
        paid_expense_cents = 0
        pending_income_cents = 0
        pending_expense_cents = 0
        overdue_income_cents = 0
        entries_count = 0

        for entry_type, status, total_cents, due_date in rows:
            if status == FinancialEntryStatus.cancelled:
                continue

            entries_count += 1
            value = int(total_cents or 0)

            if entry_type == FinancialEntryType.income:
                income_total_cents += value
                if status == FinancialEntryStatus.paid:
                    received_cents += value
                elif status == FinancialEntryStatus.pending:
                    pending_income_cents += value
                    if due_date < today:
                        overdue_income_cents += value
            elif entry_type == FinancialEntryType.expense:
                expense_total_cents += value
                if status == FinancialEntryStatus.paid:
                    paid_expense_cents += value
                elif status == FinancialEntryStatus.pending:
                    pending_expense_cents += value

        return FinancialSummary(
            income_total_cents=income_total_cents,
            expense_total_cents=expense_total_cents,
            received_cents=received_cents,
            paid_expense_cents=paid_expense_cents,
            pending_income_cents=pending_income_cents,
            pending_expense_cents=pending_expense_cents,
            overdue_income_cents=overdue_income_cents,
            balance_cents=received_cents - paid_expense_cents,
            entries_count=entries_count,
        )

    def _to_entity(
        self,
        model: FinancialEntryModel,
        patient_name: str | None = None,
        dentist_name: str | None = None,
    ) -> FinancialEntry:
        procedure_ids: list[UUID] = []
        for raw_procedure_id in model.procedure_ids or []:
            try:
                procedure_ids.append(UUID(str(raw_procedure_id)))
            except (TypeError, ValueError):
                continue

        return FinancialEntry(
            version=model.version,
            active_payment_id=model.active_payment_id,
            has_payments=bool(self.session.scalar(text("SELECT EXISTS(SELECT 1 FROM financial_payments WHERE entry_id=:id)"), {"id":model.id})),
            id=model.id,
            entry_type=model.entry_type,
            description=model.description,
            amount_cents=model.amount_cents,
            discount_cents=model.discount_cents,
            tax_cents=model.tax_cents,
            total_cents=model.total_cents,
            due_date=model.due_date,
            paid_at=model.paid_at,
            status=model.status,
            payment_method=model.payment_method,
            patient_id=model.patient_id,
            dentist_id=model.dentist_id,
            appointment_id=model.appointment_id,
            procedure_ids=procedure_ids,
            notes=model.notes,
            created_at=model.created_at,
            updated_at=model.updated_at,
            patient_name=patient_name,
            dentist_name=dentist_name,
            is_overdue=bool(
                model.status == FinancialEntryStatus.pending and model.due_date < date.today()
            ),
        )
