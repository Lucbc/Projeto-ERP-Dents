"""Versioned procedure edits, prices and references in fictitious PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
import os
from threading import Barrier
import unittest
from pydantic import ValidationError as SchemaValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import test_financial_concurrency as fixture
from src.adapters.db.models.models import ProcedureModel, AppointmentModel
from src.adapters.db.repositories.procedure_repository import SqlAlchemyProcedureRepository
from src.api.schemas.schemas import ProcedureUpdateRequest
from src.core.domain.exceptions import ConflictError, NotFoundError
from src.core.use_cases.procedure_use_cases import ProcedureUseCases


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class ProcedureVersionTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixture.FinancialConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine=self.fixture.engine
        with Session(self.engine) as db: self.id=db.scalar(select(ProcedureModel.id))

    def uc(self,db): return ProcedureUseCases(SqlAlchemyProcedureRepository(db))

    def test_two_drafts_keep_one_matching_price_duration_and_name(self):
        gate=Barrier(2,timeout=15)
        def worker(index):
            with Session(self.engine) as db:
                current=self.uc(db).get(self.id)
                gate.wait()
                try:
                    self.uc(db).update(self.id,{'version':current.version,'name':str(index),
                        'price_cents':101+index,'duration_minutes':30+index})
                    return ('ok',index)
                except ConflictError: return ('conflict',index)
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
        self.assertEqual(sorted(status for status,_ in results),['conflict','ok'])
        winner=next(index for status,index in results if status=='ok')
        with Session(self.engine) as db:
            current=self.uc(db).get(self.id)
            self.assertEqual((current.version,current.name,current.price_cents,current.duration_minutes),
                (2,str(winner),101+winner,30+winner))

    def test_stale_full_draft_cannot_restore_price_or_activation(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.update(self.id,{'version':1,'price_cents':12345,'duration_minutes':45,'active':False})
            with self.assertRaises(ConflictError):
                uc.update(self.id,{'version':1,'price_cents':12000,'duration_minutes':None,'active':True})
            current=uc.get(self.id)
            reviewed=uc.update(self.id,{'version':current.version,'description':'Reviewed'})
            self.assertEqual((reviewed.version,reviewed.price_cents,reviewed.duration_minutes,reviewed.active),(3,12345,45,False))

    def test_null_zero_and_partial_fields_remain_distinct(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            zero=uc.update(self.id,{'version':1,'price_cents':0,'duration_minutes':0})
            self.assertEqual((zero.price_cents,zero.duration_minutes),(0,0))
            empty=uc.update(self.id,{'version':2,'price_cents':None,'duration_minutes':None})
            self.assertEqual((empty.price_cents,empty.duration_minutes),(None,None))
            renamed=uc.update(self.id,{'version':3,'name':'Renamed'})
            self.assertIsNone(renamed.price_cents)
            self.assertIsNone(renamed.duration_minutes)

    def test_noop_consumes_version_and_retry_conflicts(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            self.assertEqual(uc.update(self.id,{'version':1}).version,2)
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':1})

    def test_invalid_preconditions_and_prices_are_rejected(self):
        for data in ({},{'version':None},{'version':0},{'version':-1},{'version':True},{'version':'1'},
                     {'version':1.1},{'version':1,'price_cents':-1},{'version':1,'duration_minutes':-1}):
            with self.subTest(data=data), self.assertRaises(SchemaValidationError): ProcedureUpdateRequest.model_validate(data)

    def test_database_failure_does_not_consume_version_or_change_price(self):
        with Session(self.engine) as db:
            with self.assertRaises(IntegrityError): self.uc(db).update(self.id,{'version':1,'active':None,'price_cents':1})
            db.rollback()
            current=self.uc(db).get(self.id)
            self.assertEqual((current.version,current.price_cents),(1,12000))

    def test_list_and_deleted_target(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.update(self.id,{'version':1,'description':'Updated'})
            rows,_=uc.list(None,100,0)
            self.assertEqual(next(row.version for row in rows if row.id==self.id),2)
            disposable=uc.create({'name':'Disposable fictitious procedure'})
            uc.delete(disposable.id, disposable.version)
            with self.assertRaises(NotFoundError): uc.update(disposable.id,{'version':1,'name':'Deleted'})

    def test_catalog_changes_preserve_saved_charge_links_and_booking_times(self):
        with Session(self.engine) as db:
            finance=self.fixture.use_case(db)
            before=finance.generate_from_appointment(self.fixture.appointments[0],{})
            times=db.execute(select(AppointmentModel.id,AppointmentModel.start_at,AppointmentModel.end_at).order_by(AppointmentModel.id)).all()
            self.uc(db).update(self.id,{'version':1,'name':'New name','price_cents':54321,'duration_minutes':15})
            after=finance.financial_repository.get(before.id)
            self.assertEqual((after.amount_cents,after.procedure_ids),(before.amount_cents,before.procedure_ids))
            self.assertEqual(times,db.execute(select(AppointmentModel.id,AppointmentModel.start_at,AppointmentModel.end_at).order_by(AppointmentModel.id)).all())
            self.assertEqual(finance.generate_from_appointment(self.fixture.appointments[1],{}).amount_cents,54321)

    def test_migration_preserves_catalog_and_links(self):
        migrate=self.fixture.fixture.migrate
        self.assertEqual(migrate('downgrade','0016_dentist_version').returncode,0)
        def snapshot():
            with self.engine.connect() as db:
                return (db.execute(text("SELECT (to_jsonb(p)-'version')::text FROM procedures p ORDER BY id")).scalars().all(),
                    db.execute(text('SELECT row_to_json(a)::text FROM appointment_procedures a ORDER BY appointment_id,procedure_id')).scalars().all())
        before=snapshot()
        self.assertEqual(migrate('upgrade','head').returncode,0)
        self.assertEqual(before,snapshot())
        with Session(self.engine) as db: self.assertEqual(self.uc(db).get(self.id).version,1)
