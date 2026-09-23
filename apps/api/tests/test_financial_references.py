"""Reference provenance and atomic capture in disposable homologation schemas."""
import os
import unittest
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

import test_financial_concurrency as fixture
from src.api.error_boundary import failure_response
from src.core.domain.exceptions import NotFoundError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class FinancialReferenceTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.FinancialConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.actor = SimpleNamespace(id=uuid4(), name='Fictitious operator')

    def pay(self, uc, entry, key=None):
        return uc.mark_as_paid(entry.id, entry.version, idempotency_key=key or uuid4(), actor=self.actor)

    def test_origin_payment_and_retry_survive_rename_delete_and_repayment(self):
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            entry = uc.create(self.fixture.data())
            origin = entry.reference_snapshot
            key = uuid4()
            first = self.pay(uc, entry, key)
            with self.engine.begin() as other:
                other.execute(text("UPDATE patients SET full_name='Renamed fictitious patient'"))
                other.execute(text("UPDATE dentists SET full_name='Renamed fictitious dentist'"))
                other.execute(text("UPDATE procedures SET name='Renamed fictitious procedure'"))
                other.execute(text("UPDATE appointments SET start_at=start_at+interval '7 days',end_at=end_at+interval '7 days'"))
            current = uc.get(entry.id)
            self.assertEqual(current.reference_snapshot, origin)
            self.assertEqual(current.patient_name, 'Renamed fictitious patient')
            pending = uc.reverse_payment(entry.id, 2, first['payment']['id'], uuid4(), 'Fictitious correction', self.actor)['entry']
            second = self.pay(uc, pending)
            self.assertEqual(second['payment']['reference_snapshot']['patient']['name'], 'Renamed fictitious patient')
            self.assertNotEqual(second['payment']['reference_snapshot']['appointment']['start_at'], origin['appointment']['start_at'])
            db.commit()
            with self.engine.begin() as other:
                other.execute(text('DELETE FROM appointments'))
                other.execute(text('DELETE FROM patients'))
                other.execute(text('DELETE FROM dentists'))
                other.execute(text('DELETE FROM procedures'))
            db.expire_all()
            retry = self.pay(uc, entry, key)
            self.assertEqual(retry['payment'], first['payment'])
            self.assertEqual(retry['entry'].reference_snapshot, origin)
            self.assertIsNone(retry['entry'].patient_id)
            self.assertEqual(retry['entry'].procedure_ids, [])
            self.assertEqual(retry['entry'].active_payment_id, second['payment']['id'])
            self.assertEqual(uc.payments(entry.id)[0]['reference_snapshot'], first['payment']['reference_snapshot'])
            uc.reverse_payment(entry.id, 4, second['payment']['id'], uuid4(), 'Fictitious correction', self.actor)
            edited = uc.update(entry.id, {'version':5, 'notes':'Fictitious review after deletion'})
            self.assertEqual(edited.procedure_ids, [])
            self.assertEqual(edited.reference_snapshot, origin)

    def test_snapshot_protection_and_allowed_draft_deletion(self):
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            draft = uc.create(self.fixture.data())
            for statement in ("UPDATE financial_entry_references SET snapshot='{}'", 'DELETE FROM financial_entry_references'):
                with self.assertRaises(DBAPIError), self.engine.begin() as other: other.execute(text(statement))
            uc.delete(draft.id, 1)
            paid = self.pay(uc, uc.create(self.fixture.data()))
            for statement in ("UPDATE financial_payment_references SET snapshot='{}'", 'DELETE FROM financial_payment_references'):
                with self.assertRaises(DBAPIError), self.engine.begin() as other: other.execute(text(statement))
            self.assertEqual(len(uc.payments(paid['entry'].id)), 1)
        self.assertNotEqual(self.fixture.fixture.migrate('downgrade', '0020_financial_history').returncode, 0)

    def test_invalid_procedure_rejected_without_partial_entry_or_version(self):
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            with self.assertRaises(NotFoundError): uc.create(self.fixture.data(procedure_ids=[uuid4()]))
            db.rollback()
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_entry_references')), 0)
            entry = uc.create(self.fixture.data())
            with self.assertRaises(DBAPIError): uc.financial_repository.update(entry.id, {'version':1, 'procedure_ids':[str(uuid4())]})
            db.rollback()
            self.assertEqual(uc.get(entry.id).version, 1)

    def test_capture_contention_returns_conflict_and_rolls_back(self):
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            entry = uc.create(self.fixture.data())
            with self.engine.connect() as other:
                transaction = other.begin()
                other.execute(text("UPDATE patients SET full_name='Uncommitted fictitious name' WHERE id=:id"), {'id':entry.patient_id})
                with self.assertRaises(DBAPIError) as caught: self.pay(uc, entry)
                self.assertEqual(failure_response(caught.exception, 'fictitious').status_code, 409)
                transaction.rollback()
            self.assertEqual(uc.get(entry.id).version, 1)
            self.assertEqual(uc.payments(entry.id), [])
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_payment_references')), 0)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_operations')), 0)
            self.pay(uc, entry)

    def test_receipt_failure_rolls_back_reference_and_payment(self):
        with self.engine.begin() as db:
            db.execute(text("CREATE FUNCTION reject_reference_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fictitious failure'; END $$"))
            db.execute(text('CREATE TRIGGER reject_reference_receipt BEFORE INSERT ON financial_operations FOR EACH ROW EXECUTE FUNCTION reject_reference_receipt()'))
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            entry = uc.create(self.fixture.data())
            with self.assertRaises(DBAPIError): self.pay(uc, entry)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_payment_references')), 0)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_payments')), 0)
            self.assertEqual(uc.get(entry.id).version, 1)

    def test_migration_preserves_existing_data_and_marks_unavailable_references(self):
        migrate = self.fixture.fixture.migrate
        self.assertEqual(migrate('downgrade', '0020_financial_history').returncode, 0)
        with Session(self.engine) as db:
            entry = self.fixture.legacy_create(db, {**self.fixture.data(), 'status':'pending', 'total_cents':12000,
                'procedure_ids':['invalid-legacy-id', str(uuid4())]})
            before = db.scalar(text('SELECT to_jsonb(f) FROM financial_entries f WHERE id=:id'), {'id':entry.id})
        self.assertEqual(migrate('upgrade', 'head').returncode, 0)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(text('SELECT to_jsonb(f) FROM financial_entries f WHERE id=:id'), {'id':entry.id}), before)
            snapshot = self.fixture.use_case(db).get(entry.id).reference_snapshot
            self.assertEqual(snapshot['origin'], 'migration')
            self.assertEqual(snapshot['procedures'][0], {'id':'invalid-legacy-id', 'name':None})
            self.assertIsNone(snapshot['procedures'][1]['name'])
        self.assertEqual(migrate('downgrade', '0020_financial_history').returncode, 0)

    def test_search_history_keeps_pagination_unique(self):
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            entry = uc.create(self.fixture.data())
            paid = self.pay(uc, entry)
            pending = uc.reverse_payment(entry.id, 2, paid['payment']['id'], uuid4(), 'Fictitious correction', self.actor)['entry']
            self.pay(uc, pending)
            db.execute(text("UPDATE patients SET full_name='Renamed patient'")); db.commit()
            items, total = uc.list(search='Fictitious Patient', entry_type=None, status=None, dt_from=None, dt_to=None,
                patient_id=None, dentist_id=None, appointment_id=None, limit=1, offset=0)
            self.assertEqual((len(items), total), (1, 1))
            self.assertEqual(items[0].id, entry.id)

    def test_existing_recorded_payment_gets_migration_provenance_without_event_changes(self):
        migrate = self.fixture.fixture.migrate
        self.assertEqual(migrate('downgrade', '0020_financial_history').returncode, 0)
        with Session(self.engine) as db:
            entry = self.fixture.legacy_create(db, {**self.fixture.data(), 'status':'pending', 'total_cents':12000})
            payment_id = uuid4()
            db.execute(text("""INSERT INTO financial_payments(id,entry_id,entry_type,amount_cents,discount_cents,tax_cents,
              total_cents,paid_at,actor_id,actor_name,origin) VALUES(:id,:entry,'income',12000,0,0,12000,
              '2030-01-07T13:00:00Z',:actor,'Fictitious previous operator','recorded')"""),
              {'id':payment_id, 'entry':entry.id, 'actor':self.actor.id})
            db.execute(text("UPDATE financial_entries SET status='paid',paid_at='2030-01-07T13:00:00Z',active_payment_id=:payment WHERE id=:id"),
              {'payment':payment_id, 'id':entry.id})
            db.commit()
            before = db.scalar(text('SELECT to_jsonb(p) FROM financial_payments p'))
        self.assertEqual(migrate('upgrade', 'head').returncode, 0)
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(text('SELECT to_jsonb(p) FROM financial_payments p')), before)
            event = self.fixture.use_case(db).payments(entry.id)[0]
            self.assertEqual(event['origin'], 'recorded')
            self.assertEqual(event['reference_snapshot']['origin'], 'migration')
            self.assertEqual(event['actor_id'], self.actor.id)

    def test_deletion_between_validation_and_creation_and_during_payment(self):
        from src.adapters.db.models.models import PatientModel, ProcedureModel
        with Session(self.engine) as db:
            patient = PatientModel(full_name='Fictitious removable patient')
            procedure = ProcedureModel(name='Fictitious removable procedure', price_cents=12000)
            db.add_all([patient, procedure]); db.commit()
            patient_id, procedure_id = patient.id, procedure.id
            uc = self.fixture.use_case(db)
            original = uc.financial_repository.create
            def remove_after_validation(data):
                with self.engine.begin() as other:
                    other.execute(text('DELETE FROM procedures WHERE id=:id'), {'id':procedure_id})
                return original(data)
            uc.financial_repository.create = remove_after_validation
            with self.assertRaises(DBAPIError):
                uc.create({**self.fixture.data(), 'appointment_id':None, 'procedure_ids':[procedure_id]})
            db.rollback()
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_entries')), 0)
            uc.financial_repository.create = original
            entry = uc.create({**self.fixture.data(), 'appointment_id':None, 'patient_id':patient_id})
            with self.engine.begin() as other:
                other.execute(text('SELECT id FROM patients WHERE id=:id FOR UPDATE'), {'id':patient_id})
                with self.assertRaises(DBAPIError) as caught: self.pay(uc, entry)
                self.assertEqual(getattr(caught.exception.orig, 'sqlstate', None), '55P03')
                other.execute(text('DELETE FROM patients WHERE id=:id'), {'id':patient_id})
            current = uc.get(entry.id)
            self.assertIsNone(current.patient_id)
            self.assertEqual(current.reference_snapshot['patient']['name'], 'Fictitious removable patient')
            self.assertEqual(current.version, 1)
            self.assertEqual(uc.payments(entry.id), [])
