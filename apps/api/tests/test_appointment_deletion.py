"""Atomic appointment deletion and financial races in private PostgreSQL schemas."""
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
import test_financial_concurrency as fixture
from src.adapters.db.models.models import AppointmentModel
from src.adapters.db.repositories.appointment_repository import SqlAlchemyAppointmentRepository as Repository
from src.core.domain.exceptions import ConflictError, NotFoundError, ValidationError
from src.api.error_boundary import failure_response


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class AppointmentDeletionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.FinancialConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.id = self.fixture.appointments[0]
        self.actor = SimpleNamespace(id=uuid4(), name='Fictitious operator')

    def test_loaded_old_row_cannot_delete_new_version_or_links(self):
        with Session(self.engine) as db:
            repo = Repository(db)
            loaded = db.get(AppointmentModel, self.id)
            links = repo.get(self.id).procedure_ids
            with Session(self.engine) as other:
                Repository(other).update(self.id, {'version':1, 'notes':'Fictitious revision'})
            self.assertEqual(loaded.version, 1)
            for version in (None, 0, -1, True, '1'):
                with self.assertRaises(ValidationError): repo.delete(self.id, version)
            with self.assertRaises(ConflictError) as error: repo.delete(self.id, 1)
            self.assertEqual(error.exception.code, 'stale_version')
            current = repo.get(self.id)
            self.assertEqual((current.version, current.procedure_ids), (2, links))
            self.assertTrue(repo.has_conflict(current.start_at, current.end_at, current.dentist_id))
            self.assertTrue(repo.delete(self.id, 2))
            self.assertFalse(repo.delete(self.id, 2))
            self.assertFalse(repo.has_conflict(current.start_at, current.end_at, current.dentist_id))
            self.assertEqual(db.scalar(text('SELECT count(*) FROM appointment_procedures WHERE appointment_id=:id'), {'id':self.id}), 0)

    def race(self, both_delete):
        gate = Barrier(2, timeout=15)
        def worker(index):
            with Session(self.engine) as db:
                repo = Repository(db)
                self.assertEqual(repo.get(self.id).version, 1)
                gate.wait()
                try:
                    return bool(repo.delete(self.id, 1) if both_delete or index else
                                repo.update(self.id, {'version':1, 'notes':'Fictitious winner'}))
                except ConflictError: return False
        with ThreadPoolExecutor(max_workers=2) as pool: result = list(pool.map(worker, range(2)))
        self.assertEqual(sum(result), 1)

    def test_edit_and_delete_have_one_winner(self): self.race(False)
    def test_two_deletions_have_one_winner(self): self.race(True)

    def test_existing_clinical_status_policy_is_preserved(self):
        for status in ('scheduled', 'confirmed', 'completed', 'cancelled'):
            id = self.fixture.fixture.insert(self.fixture.fixture.data(hour=3, status=status))
            with Session(self.engine) as db: self.assertTrue(Repository(db).delete(id, 1))

    def create_financial(self, uc, id, generated, paid, key):
        payload = {'status':'paid' if paid else 'pending', 'idempotency_key':key}
        if generated: return uc.generate_from_appointment(id, payload, actor=self.actor)
        return uc.create({**self.fixture.data(), **payload, 'appointment_id':id}, actor=self.actor)

    def test_charge_commit_then_delete_preserves_history_and_replay(self):
        for generated in (False, True):
            for paid in (False, True):
                with self.subTest(generated=generated, paid=paid):
                    id = self.fixture.fixture.insert(self.fixture.fixture.data(hour=3))
                    # Generation requires a priced procedure.
                    with self.engine.begin() as db:
                        db.execute(text('INSERT INTO appointment_procedures(appointment_id,procedure_id,created_at) SELECT :id,procedure_id,now() FROM appointment_procedures WHERE appointment_id=:source'), {'id':id,'source':self.id})
                    key = uuid4(); committed = Barrier(2, timeout=15)
                    def finance():
                        with Session(self.engine) as db:
                            uc = self.fixture.use_case(db)
                            entry = self.create_financial(uc, id, generated, paid, key)
                            history = uc.payments(entry.id)
                            db.commit()  # Release read locks before SET NULL in the other connection.
                            committed.wait()
                            return entry, history
                    def delete():
                        committed.wait()
                        with Session(self.engine) as db: return Repository(db).delete(id, 1)
                    with ThreadPoolExecutor(max_workers=2) as pool:
                        f=pool.submit(finance); d=pool.submit(delete)
                        before, history=f.result(); self.assertTrue(d.result())
                    with Session(self.engine) as db:
                        uc=self.fixture.use_case(db); current=uc.get(before.id)
                        self.assertIsNone(current.appointment_id)
                        for field in ('version','status','amount_cents','total_cents','reference_snapshot','active_payment_id'):
                            self.assertEqual(getattr(current,field),getattr(before,field))
                        self.assertEqual(uc.payments(before.id),history)
                        if generated or paid:
                            replay=self.create_financial(uc,id,generated,paid,key)
                            self.assertEqual(replay.id,before.id)
                        with self.assertRaises(NotFoundError): self.create_financial(uc,id,generated,paid,uuid4())

    def test_delete_between_charge_validation_and_write_rolls_back_everything(self):
        for generated in (False, True):
            for paid in (False, True):
                with self.subTest(generated=generated, paid=paid):
                    id=self.fixture.fixture.insert(self.fixture.fixture.data(hour=3))
                    with self.engine.begin() as db:
                        db.execute(text('INSERT INTO appointment_procedures(appointment_id,procedure_id,created_at) SELECT :id,procedure_id,now() FROM appointment_procedures WHERE appointment_id=:source'),{'id':id,'source':self.id})
                    gate=Barrier(2,timeout=15); deleted=Event()
                    def finance():
                        with Session(self.engine) as db:
                            uc=self.fixture.use_case(db); repo=uc.financial_repository
                            method='create_paid' if paid else ('create_generated' if generated else 'create')
                            original=getattr(repo,method)
                            def delayed(*args, **kwargs):
                                gate.wait(); self.assertTrue(deleted.wait(15))
                                return original(*args, **kwargs)
                            setattr(repo,method,delayed)
                            with self.assertRaises((DBAPIError,ConflictError,NotFoundError)):
                                self.create_financial(uc,id,generated,paid,uuid4())
                            db.rollback()
                    def delete():
                        gate.wait()
                        try:
                            with Session(self.engine) as db: self.assertTrue(Repository(db).delete(id,1))
                        finally: deleted.set()
                    with ThreadPoolExecutor(max_workers=2) as pool:
                        f=pool.submit(finance); d=pool.submit(delete); f.result(); d.result()
                    with self.engine.connect() as db:
                        for table in ('financial_entries','financial_payments','financial_operations','financial_generations','financial_entry_references','financial_payment_references'):
                            self.assertEqual(db.scalar(text(f'SELECT count(*) FROM {table}')),0)

    def test_payment_against_locked_deletion_rolls_back_then_can_pay_without_current_link(self):
        with Session(self.engine) as db:
            uc=self.fixture.use_case(db); entry=uc.create(self.fixture.data())
            db.execute(text('SELECT id FROM financial_entries WHERE id=:id FOR UPDATE'),{'id':entry.id})
            gate=Barrier(2,timeout=15)
            def delete():
                with Session(self.engine) as other:
                    other.scalar(select(AppointmentModel).where(AppointmentModel.id==self.id).with_for_update())
                    gate.wait()
                    return Repository(other).delete(self.id,1)
            with ThreadPoolExecutor(max_workers=1) as pool:
                task=pool.submit(delete); gate.wait()
                with self.assertRaises(DBAPIError) as error:
                    uc.mark_as_paid(entry.id,1,idempotency_key=uuid4(),actor=self.actor)
                db.rollback()
                self.assertEqual(failure_response(error.exception, 'fictitious-test').status_code,409)
                self.assertTrue(task.result(timeout=15))
            self.assertEqual(uc.payments(entry.id),[])
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_operations')),0)
            result=uc.mark_as_paid(entry.id,1,idempotency_key=uuid4(),actor=self.actor)
            self.assertEqual(result['payment']['reference_snapshot']['appointment'], {'id':None, 'start_at':None})
            self.assertEqual(result['entry'].reference_snapshot['appointment']['id'],str(self.id))
