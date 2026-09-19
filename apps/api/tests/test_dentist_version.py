"""Dentist edits protect schedule, specialty and profile as one versioned row."""
from concurrent.futures import ThreadPoolExecutor
import os
from threading import Barrier
import unittest
from pydantic import ValidationError as SchemaValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.api.schemas.schemas import DentistUpdateRequest
from src.core.domain.exceptions import ConflictError, NotFoundError, ValidationError
from src.core.use_cases.dentist_use_cases import DentistUseCases


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class DentistVersionTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine=self.fixture.engine
        self.id=self.fixture.dentists[0]

    def uc(self,db): return DentistUseCases(fixture.SqlAlchemyDentistRepository(db))

    def slots(self,hour): return [{'day_of_week':'monday','start_time':hour,'end_time':'18:00'}]

    def test_two_drafts_commit_one_matching_profile_and_schedule(self):
        gate=Barrier(2,timeout=15)
        def worker(index):
            with Session(self.engine) as db:
                current=self.uc(db).get(self.id)
                gate.wait()
                try:
                    self.uc(db).update(self.id,{'version':current.version,'specialty':str(index),
                        'phone':str(index),'availability':self.slots(f'{8+index:02}:00')})
                    return ('ok',index)
                except ConflictError: return ('conflict',index)
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
        self.assertEqual(sorted(status for status,_ in results),['conflict','ok'])
        winner=next(index for status,index in results if status=='ok')
        with Session(self.engine) as db:
            current=self.uc(db).get(self.id)
            self.assertEqual((current.version,current.specialty,current.phone),(2,str(winner),str(winner)))
            self.assertEqual(current.availability,self.slots(f'{8+winner:02}:00'))

    def test_stale_full_draft_cannot_restore_old_schedule_and_reload_can_save(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            old=uc.get(self.id)
            uc.update(self.id,{'version':1,'specialty':'Current specialty','availability':self.slots('09:00')})
            with self.assertRaises(ConflictError):
                uc.update(self.id,{'version':1,'specialty':'Old specialty','availability':old.availability,'phone':'Draft'})
            current=uc.get(self.id)
            self.assertEqual(current.availability,self.slots('09:00'))
            reviewed=uc.update(self.id,{'version':current.version,'phone':'Reviewed'})
            self.assertEqual(reviewed.version,3)
            self.assertEqual(reviewed.specialty,'Current specialty')
            self.assertEqual(reviewed.availability,self.slots('09:00'))

    def test_stale_activation_does_not_reactivate(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.update(self.id,{'version':1,'active':False})
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':1,'active':True})
            self.assertFalse(uc.get(self.id).active)

    def test_noop_consumes_version_and_retry_conflicts(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            self.assertEqual(uc.update(self.id,{'version':1}).version,2)
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':1})

    def test_invalid_preconditions_rejected(self):
        for data in ({},{'version':None},{'version':0},{'version':-1},{'version':True},{'version':'1'},{'version':1.1}):
            with self.subTest(data=data), self.assertRaises(SchemaValidationError): DentistUpdateRequest.model_validate(data)

    def test_failed_database_write_does_not_consume_version(self):
        with Session(self.engine) as db:
            with self.assertRaises(IntegrityError): self.uc(db).update(self.id,{'version':1,'active':None,'availability':[]})
            db.rollback()
            self.assertEqual(self.uc(db).get(self.id).version,1)
            self.assertTrue(self.uc(db).get(self.id).availability)

    def test_invalid_schedule_does_not_consume_version(self):
        with Session(self.engine) as db:
            with self.assertRaises(ValidationError): self.uc(db).update(self.id,{'version':1,'availability':self.slots('19:00')})
            self.assertEqual(self.uc(db).get(self.id).version,1)

    def test_list_exposes_latest_version(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.update(self.id,{'version':1,'phone':'Updated'})
            rows,_=uc.list(None,100,0)
            self.assertEqual(next(row.version for row in rows if row.id==self.id),2)

    def test_deleted_target_returns_not_found(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.delete(self.id)
            with self.assertRaises(NotFoundError): uc.update(self.id,{'version':1,'phone':'Stale'})

    def test_migration_preserves_all_business_fields(self):
        self.assertEqual(self.fixture.migrate('downgrade','0015_appointment_version').returncode,0)
        def snapshot():
            with self.engine.connect() as db:
                return db.execute(text("SELECT (to_jsonb(d)-'version')::text FROM dentists d ORDER BY id")).scalars().all()
        before=snapshot()
        self.assertEqual(self.fixture.migrate('upgrade','head').returncode,0)
        self.assertEqual(before,snapshot())
        with Session(self.engine) as db: self.assertEqual(self.uc(db).get(self.id).version,1)
