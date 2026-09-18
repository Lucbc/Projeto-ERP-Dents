"""Financial races use independent connections and disposable fictitious schemas."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import os
from threading import Barrier
import unittest
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import test_appointment_concurrency as agenda_fixture
from src.adapters.db.models.models import FinancialEntryModel, FinancialGenerationModel, ProcedureModel, AppointmentProcedureModel
from src.adapters.db.repositories.financial_repository import SqlAlchemyFinancialRepository
from src.core.use_cases.financial_use_cases import FinancialUseCases
from src.core.domain.exceptions import ConflictError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class FinancialConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.fixture = agenda_fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.appointments = [self.fixture.insert(self.fixture.data(hour=i)) for i in range(2)]
        with Session(self.engine) as db:
            procedure = ProcedureModel(name='Fictitious procedure', price_cents=12000)
            db.add(procedure)
            db.flush()
            for id in self.appointments:
                db.add(AppointmentProcedureModel(appointment_id=id, procedure_id=procedure.id))
            db.commit()

    def use_case(self, db):
        return FinancialUseCases(SqlAlchemyFinancialRepository(db),
            agenda_fixture.SqlAlchemyAppointmentRepository(db), agenda_fixture.SqlAlchemyPatientRepository(db),
            agenda_fixture.SqlAlchemyDentistRepository(db), agenda_fixture.SqlAlchemyProcedureRepository(db))

    def data(self, index=0, **kwargs):
        return dict(entry_type='income', description='Fictitious charge', amount_cents=12000,
                    due_date=date(2030,1,7), appointment_id=self.appointments[index], **kwargs)

    def race(self, calls, method='create'):
        gate = Barrier(2, timeout=15)
        def worker(call):
            with Session(self.engine) as db:
                uc = self.use_case(db)
                repo = uc.financial_repository
                original = getattr(repo, method)
                def synchronized(*args):
                    gate.wait()
                    return original(*args)
                setattr(repo, method, synchronized)
                try:
                    return ('ok', call(uc).id)
                except (IntegrityError, ConflictError) as exc:
                    db.rollback()
                    return ('conflict', getattr(getattr(exc, 'orig', None), 'sqlstate', None))
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(worker, calls))

    def count(self, model=FinancialEntryModel):
        with Session(self.engine) as db: return len(db.scalars(select(model)).all())

    def test_manual_creates_after_both_prechecks_pass(self):
        result = self.race([lambda uc: uc.create(self.data())]*2)
        self.assertEqual(sorted(status for status,_ in result), ['conflict','ok'])
        self.assertEqual(self.count(), 1)

    def test_same_key_concurrent_generation_returns_same_entry(self):
        key = uuid4()
        result = self.race([lambda uc: uc.generate_from_appointment(self.appointments[0], {'idempotency_key':key})]*2, 'create_generated')
        self.assertEqual(result[0], result[1])
        self.assertEqual(result[0][0], 'ok')
        self.assertEqual(self.count(), 1)
        self.assertEqual(self.count(FinancialGenerationModel), 1)

    def test_different_keys_same_appointment_conflict(self):
        result = self.race([lambda uc: uc.generate_from_appointment(self.appointments[0], {'idempotency_key':uuid4()})]*2, 'create_generated')
        self.assertEqual(sorted(status for status,_ in result), ['conflict','ok'])
        self.assertEqual(self.count(), 1)

    def test_same_key_different_appointments_rolls_back_losing_charge(self):
        key = uuid4()
        result = self.race([lambda uc: uc.generate_from_appointment(self.appointments[0], {'idempotency_key':key}),
                            lambda uc: uc.generate_from_appointment(self.appointments[1], {'idempotency_key':key})], 'create_generated')
        self.assertEqual(sorted(status for status,_ in result), ['conflict','ok'])
        self.assertEqual(self.count(), 1)

    def test_independent_appointments_succeed(self):
        result = self.race([lambda uc: uc.create(self.data()), lambda uc: uc.create(self.data(1))])
        self.assertEqual([status for status,_ in result], ['ok','ok'])

    def test_concurrent_reactivation_preserves_loser(self):
        with Session(self.engine) as db:
            uc = self.use_case(db)
            first = uc.create(self.data(status='cancelled')).id
            second = uc.create(self.data(status='cancelled')).id
        result = self.race([lambda uc: uc.update(first, {'status':'pending'}),
                            lambda uc: uc.update(second, {'status':'paid'})], 'update')
        self.assertEqual(sorted(status for status,_ in result), ['conflict','ok'])
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(text("SELECT count(*) FROM financial_entries WHERE status='cancelled'")), 1)

    def test_retry_does_not_overwrite_paid_or_cancelled_state(self):
        key = uuid4()
        with Session(self.engine) as db:
            uc = self.use_case(db)
            entry = uc.generate_from_appointment(self.appointments[0], {'idempotency_key':key})
            uc.mark_as_paid(entry.id)
            retry = uc.generate_from_appointment(self.appointments[0], {'idempotency_key':key})
            self.assertEqual(retry.id, entry.id)
            self.assertEqual(retry.status.value, 'paid')
            uc.update(entry.id, {'status':'cancelled'})
            replacement = uc.generate_from_appointment(self.appointments[0], {'idempotency_key':uuid4()})
            retry = uc.generate_from_appointment(self.appointments[0], {'idempotency_key':key})
            self.assertEqual(retry.id, entry.id)
            self.assertEqual(retry.status.value, 'cancelled')
            self.assertNotEqual(replacement.id, entry.id)

    def test_changed_request_and_deleted_result_do_not_regenerate(self):
        key = uuid4()
        with Session(self.engine) as db:
            uc = self.use_case(db)
            entry = uc.generate_from_appointment(self.appointments[0], {'idempotency_key':key})
            with self.assertRaises(ConflictError):
                uc.generate_from_appointment(self.appointments[0], {'idempotency_key':key, 'notes':'Changed'})
            uc.delete(entry.id)
        with Session(self.engine) as db:
            with self.assertRaises(ConflictError):
                self.use_case(db).generate_from_appointment(self.appointments[0], {'idempotency_key':key})
        self.assertEqual(self.count(), 0)
        self.assertEqual(self.count(FinancialGenerationModel), 1)

    def test_unlinked_entries_remain_independent(self):
        with Session(self.engine) as db:
            uc = self.use_case(db)
            data = self.data()
            data['appointment_id'] = None
            uc.create(data)
            uc.create(data)
        self.assertEqual(self.count(), 2)

    def test_legacy_duplicate_reproduction_and_upgrade_refusal(self):
        self.assertEqual(self.fixture.migrate('downgrade','0012_appointment_exclusion').returncode, 0)
        result = self.race([lambda uc: uc.create(self.data())]*2)
        self.assertEqual([status for status,_ in result], ['ok','ok'])
        migration = self.fixture.migrate('upgrade','head')
        self.assertNotEqual(migration.returncode, 0)
        self.assertIn(b'nenhum dado foi alterado', migration.stderr)
        self.assertEqual(self.count(), 2)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(text('SELECT version_num FROM alembic_version')), '0012_appointment_exclusion')

    def test_upgrade_preserves_valid_records(self):
        self.assertEqual(self.fixture.migrate('downgrade','0012_appointment_exclusion').returncode, 0)
        with Session(self.engine) as db:
            uc = self.use_case(db)
            cancelled = uc.create(self.data(status='cancelled')).id
            active = uc.create(self.data()).id
        self.assertEqual(self.fixture.migrate('upgrade','head').returncode, 0)
        with Session(self.engine) as db:
            self.assertEqual(set(db.scalars(select(FinancialEntryModel.id))), {cancelled,active})
