"""Financial write races in disposable schemas, preserving generation receipts."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier
from uuid import uuid4
import os
import unittest
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import ValidationError as SchemaValidationError
import test_financial_concurrency as fixture
from src.core.domain.entities import PaymentMethod
from src.core.domain.exceptions import ConflictError, NotFoundError
from src.api.schemas.schemas import FinancialEntryUpdateRequest, FinancialMarkPaidRequest


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS')=='1','Homologation opt-in required')
class FinancialVersionTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixture.FinancialConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine=self.fixture.engine
        with Session(self.engine) as db:
            self.id=self.uc(db).create(self.fixture.data()).id

    def uc(self,db): return self.fixture.use_case(db)

    def race(self, operations):
        gate=Barrier(2,timeout=15)
        def worker(operation):
            with Session(self.engine) as db:
                uc=self.uc(db)
                repo=uc.financial_repository
                # Both operations finish their preliminary reads before either write.
                for name in ('update','delete','settle'):
                    original=getattr(repo,name)
                    def synchronized(*args,_original=original,**kwargs):
                        gate.wait()
                        return _original(*args,**kwargs)
                    setattr(repo,name,synchronized)
                try:
                    operation(uc)
                    return 'ok'
                except (ConflictError,NotFoundError): return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,operations))
        self.assertEqual(sorted(results),['conflict','ok'])

    def test_two_edits_keep_coherent_total_and_winner_fields(self):
        self.race([lambda uc:uc.update(self.id,{'version':1,'amount_cents':23456,'discount_cents':100,'notes':'A'}),
                   lambda uc:uc.update(self.id,{'version':1,'amount_cents':34567,'tax_cents':200,'notes':'B'})])
        with Session(self.engine) as db:
            row=self.uc(db).get(self.id)
            self.assertEqual(row.version,2)
            self.assertIn((row.amount_cents,row.total_cents,row.notes),[(23456,23356,'A'),(34567,34767,'B')])

    def test_edit_against_payment(self):
        self.race([lambda uc:uc.update(self.id,{'version':1,'notes':'Edited'}),lambda uc:fixture.settle(uc,self.id,1)])
        with Session(self.engine) as db:
            row=self.uc(db).get(self.id)
            self.assertEqual(row.version,2)
            self.assertEqual(row.notes,'Edited' if row.status.value=='pending' else None)
            self.assertEqual(row.paid_at is not None,row.status.value=='paid')

    def test_cancellation_against_payment(self):
        self.race([lambda uc:uc.update(self.id,{'version':1,'status':'cancelled'}),lambda uc:fixture.settle(uc,self.id,1)])
        with Session(self.engine) as db:
            row=self.uc(db).get(self.id)
            self.assertEqual(row.version,2)
            self.assertIn(row.status.value,('paid','cancelled'))
            self.assertEqual(row.paid_at is not None,row.status.value=='paid')

    def test_two_payments_preserve_one_date_and_method(self):
        a=datetime(2030,1,1,12,tzinfo=timezone.utc)
        b=datetime(2030,1,2,12,tzinfo=timezone.utc)
        self.race([lambda uc:fixture.settle(uc,self.id,1,a,PaymentMethod.pix),
                   lambda uc:fixture.settle(uc,self.id,1,b,PaymentMethod.cash)])
        with Session(self.engine) as db:
            row=self.uc(db).get(self.id)
            self.assertEqual(row.version,2)
            self.assertIn((row.paid_at,row.payment_method),[(a,PaymentMethod.pix),(b,PaymentMethod.cash)])

    def test_edit_against_delete(self):
        self.race([lambda uc:uc.update(self.id,{'version':1,'amount_cents':999}),lambda uc:uc.delete(self.id,1)])
        with Session(self.engine) as db:
            row=self.uc(db).financial_repository.get(self.id)
            if row: self.assertEqual((row.version,row.amount_cents),(2,999))

    def test_partial_edit_cannot_overwrite_concurrent_amount(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            original=uc.financial_repository.update
            def interleaved(id,data,**kwargs):
                with Session(self.engine) as other: self.uc(other).update(id,{'version':1,'amount_cents':23456})
                return original(id,data,**kwargs)
            uc.financial_repository.update=interleaved
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':1,'notes':'Old snapshot'})
        with Session(self.engine) as db:
            row=self.uc(db).get(self.id)
            self.assertEqual((row.version,row.amount_cents,row.notes),(2,23456,None))

    def test_repeat_and_state_conflicts_do_not_rewrite_settlement(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            first=fixture.settle(uc,self.id,1,payment_method=PaymentMethod.pix)
            for version,code in ((1,'stale_version'),(2,'financial_state_conflict')):
                with self.assertRaises(ConflictError) as caught: fixture.settle(uc,self.id,version,payment_method=PaymentMethod.cash)
                self.assertEqual(caught.exception.code,code)
            current=uc.get(self.id)
            self.assertEqual((current.version,current.paid_at,current.payment_method,current.updated_at),
                (first.version,first.paid_at,first.payment_method,first.updated_at))
            fixture.reverse(uc, current)
            uc.update(self.id,{'version':3,'status':'cancelled'})
            with self.assertRaises(ConflictError) as caught: fixture.settle(uc,self.id,4)
            self.assertEqual(caught.exception.code,'financial_state_conflict')

    def test_preconditions_noop_partial_and_deleted_target(self):
        for schema in (FinancialEntryUpdateRequest,FinancialMarkPaidRequest):
            for data in ({},{'version':None},{'version':0},{'version':True},{'version':'1'},{'version':1.5}):
                with self.subTest(schema=schema.__name__,data=data),self.assertRaises(SchemaValidationError): schema.model_validate(data)
        with Session(self.engine) as db:
            uc=self.uc(db)
            current=uc.update(self.id,{'version':1})
            self.assertEqual((current.version,current.amount_cents,current.procedure_ids),(2,12000,uc.get(self.id).procedure_ids))
            with self.assertRaises(ConflictError): uc.delete(self.id,1)
            uc.delete(self.id,2)
            with self.assertRaises(NotFoundError): uc.delete(self.id,2)
            with self.assertRaises(NotFoundError): fixture.settle(uc,self.id,2)

    def test_rejected_index_and_fk_keep_version_and_values(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            other=uc.create({**self.fixture.data(status='cancelled'),'appointment_id':None})
            with self.assertRaises(IntegrityError):
                uc.financial_repository.update(other.id,{'version':1,'status':'pending','appointment_id':self.fixture.appointments[0]})
            self.assertEqual(uc.get(other.id).version,1)
            self.assertIsNone(uc.get(other.id).appointment_id)
            with self.assertRaises(IntegrityError): uc.financial_repository.update(self.id,{'version':1,'patient_id':uuid4()})
            db.rollback()
            self.assertEqual((uc.get(self.id).version,uc.get(self.id).amount_cents),(1,12000))

    def test_migration_preserves_records_receipts_and_positive_version(self):
        with Session(self.engine) as db:
            self.uc(db).generate_from_appointment(self.fixture.appointments[1],{'idempotency_key':uuid4()})
        migrate=self.fixture.fixture.migrate
        self.assertEqual(migrate('downgrade','0018_specialty_version').returncode,0)
        def snapshot():
            with self.engine.connect() as db:
                return (db.execute(text("SELECT (to_jsonb(f)-'version'-'active_payment_id')::text FROM financial_entries f ORDER BY id")).scalars().all(),
                    db.execute(text('SELECT row_to_json(g)::text FROM financial_generations g ORDER BY key')).scalars().all())
        before=snapshot()
        self.assertEqual(migrate('upgrade','head').returncode,0)
        self.assertEqual(before,snapshot())
        with self.engine.begin() as db: self.assertEqual(db.execute(text('SELECT DISTINCT version FROM financial_entries')).scalars().all(),[1])
        with self.assertRaises(IntegrityError),self.engine.begin() as db: db.execute(text('UPDATE financial_entries SET version=0'))
