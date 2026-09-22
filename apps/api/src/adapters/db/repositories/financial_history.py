"""One transaction owns the entry, immutable event and durable receipt."""
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, text

from src.adapters.db.models.models import FinancialEntryModel
from src.core.domain.entities import FinancialEntryStatus
from src.core.domain.exceptions import ConflictError, NotFoundError


class FinancialHistoryMixin:
    def _lock_operation(self, key):
        # Transaction-scoped, stable across workers; collisions merely serialize requests.
        self.session.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:key,0))'), {'key':str(key)})

    def operation(self, key, kind, request_hash):
        row = self.session.execute(text('SELECT * FROM financial_operations WHERE key=:key'), {'key':key}).mappings().first()
        if row is None:
            return None
        if row['kind'] != kind or row['request_hash'] != request_hash:
            raise ConflictError('Esta chave já foi usada com outros dados.', code='idempotency_conflict')
        return self._operation_result(row, True)

    def _operation_result(self, operation, replayed):
        # Keep the returned entry and reversal state consistent during this read.
        self.session.execute(select(FinancialEntryModel).where(FinancialEntryModel.id==operation['entry_id'])
                             .with_for_update(read=True).execution_options(populate_existing=True)).scalar_one()
        payment = self.session.execute(text('SELECT * FROM financial_payments WHERE id=:id'), {'id':operation['payment_id']}).mappings().one()
        reversal = self.session.execute(text('SELECT * FROM financial_reversals WHERE payment_id=:id'), {'id':payment['id']}).mappings().first()
        return {'entry':self.get(operation['entry_id']), 'payment':dict(payment),
                'reversal':dict(reversal) if reversal else None, 'replayed':replayed}

    def payments(self, entry_id):
        rows = self.session.execute(text('SELECT * FROM financial_payments WHERE entry_id=:id ORDER BY recorded_at,id'), {'id':entry_id}).mappings().all()
        reversals = self.session.execute(text('SELECT r.* FROM financial_reversals r JOIN financial_payments p ON p.id=r.payment_id WHERE p.entry_id=:id'), {'id':entry_id}).mappings().all()
        by_payment = {r['payment_id']:dict(r) for r in reversals}
        return [{**dict(row), 'reversal':by_payment.get(row['id'])} for row in rows]

    def _receipt(self, key, kind, request_hash, item, payment_id, reversal_id=None):
        values = {'key':key, 'kind':kind, 'request_hash':request_hash, 'entry_id':item.id,
                  'payment_id':payment_id, 'reversal_id':reversal_id}
        self.session.execute(text('''INSERT INTO financial_operations(key,kind,request_hash,entry_id,payment_id,reversal_id)
            VALUES(:key,:kind,:request_hash,:entry_id,:payment_id,:reversal_id)'''), values)
        return values

    def _payment(self, item, actor, payment_id):
        values = {field:getattr(item,field) for field in ('amount_cents','discount_cents','tax_cents','total_cents','paid_at')}
        values.update(id=payment_id, entry_id=item.id, entry_type=item.entry_type.value,
                      payment_method=item.payment_method.value if item.payment_method else None,
                      actor_id=actor.id, actor_name=actor.name)
        self.session.execute(text('''INSERT INTO financial_payments
            (id,entry_id,entry_type,amount_cents,discount_cents,tax_cents,total_cents,paid_at,payment_method,actor_id,actor_name,origin)
            VALUES(:id,:entry_id,:entry_type,:amount_cents,:discount_cents,:tax_cents,:total_cents,:paid_at,:payment_method,:actor_id,:actor_name,'recorded')'''), values)

    def _locked_entry(self, id, version):
        item = self.session.scalar(select(FinancialEntryModel).where(FinancialEntryModel.id==id)
                                   .with_for_update().execution_options(populate_existing=True))
        if item is None:
            raise NotFoundError('Lançamento financeiro não encontrado.')
        if item.version != version:
            raise ConflictError('O lançamento mudou. Recarregue antes de confirmar.', code='stale_version')
        return item

    def settle(self, id, version, key, request_hash, paid_at, payment_method, actor):
        try:
            self._lock_operation(key)
            existing = self.operation(key, 'settle', request_hash)
            if existing:
                self.session.commit()
                return existing
            item = self._locked_entry(id, version)
            if item.status != FinancialEntryStatus.pending:
                raise ConflictError('Somente lançamento pendente pode receber baixa.', code='financial_state_conflict')
            payment_id = uuid4()
            item.status, item.active_payment_id = FinancialEntryStatus.paid, payment_id
            item.paid_at = paid_at or datetime.now(timezone.utc)
            if payment_method is not None:
                item.payment_method = payment_method
            item.version += 1
            self.session.flush()
            self._payment(item, actor, payment_id)
            receipt = self._receipt(key, 'settle', request_hash, item, payment_id)
            self.session.commit()
            return self._operation_result(receipt, False)
        except Exception:
            self.session.rollback()
            raise

    def reverse(self, id, version, payment_id, key, request_hash, reason, actor):
        try:
            self._lock_operation(key)
            existing = self.operation(key, 'reverse', request_hash)
            if existing:
                self.session.commit()
                return existing
            item = self._locked_entry(id, version)
            if item.status != FinancialEntryStatus.paid or item.active_payment_id != payment_id:
                raise ConflictError('Este pagamento não está ativo. Confira o histórico.', code='financial_state_conflict')
            reversal_id = uuid4()
            self.session.execute(text('''INSERT INTO financial_reversals(id,payment_id,actor_id,actor_name,reason)
                VALUES(:id,:payment,:actor,:name,:reason)'''),
                {'id':reversal_id,'payment':payment_id,'actor':actor.id,'name':actor.name,'reason':reason})
            item.status, item.active_payment_id, item.paid_at = FinancialEntryStatus.pending, None, None
            item.version += 1
            self.session.flush()
            receipt = self._receipt(key, 'reverse', request_hash, item, payment_id, reversal_id)
            self.session.commit()
            return self._operation_result(receipt, False)
        except Exception:
            self.session.rollback()
            raise

    def create_paid(self, data, key, kind, request_hash, actor, generation_hash=None):
        from src.adapters.db.models.models import FinancialGenerationModel
        try:
            self._lock_operation(key)
            existing = self.operation(key, kind, request_hash)
            if existing:
                self.session.commit()
                return existing['entry']
            if generation_hash is not None:
                existing_entry = self.get_generation(key, generation_hash)
                if existing_entry:
                    self.session.commit()
                    return existing_entry
            payment_id = uuid4()
            item = FinancialEntryModel(**data, active_payment_id=payment_id)
            self.session.add(item)
            self.session.flush()
            self._payment(item, actor, payment_id)
            self._receipt(key, kind, request_hash, item, payment_id)
            if generation_hash is not None:
                self.session.add(FinancialGenerationModel(key=key, request_hash=generation_hash, entry_id=item.id))
            self.session.commit()
            return self._to_entity(item)
        except Exception:
            self.session.rollback()
            raise
