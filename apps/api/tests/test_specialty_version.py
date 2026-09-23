"""Specialty races and name uniqueness in isolated fictitious PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
import os
from threading import Barrier
import unittest
from pydantic import ValidationError as SchemaValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.models.models import DentistModel, SpecialtyModel
from src.adapters.db.repositories.specialty_repository import SqlAlchemySpecialtyRepository
from src.api.schemas.schemas import SpecialtyUpdateRequest
from src.core.domain.exceptions import ConflictError, NotFoundError
from src.core.use_cases.specialty_use_cases import SpecialtyUseCases


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class SpecialtyVersionTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine=self.fixture.engine
        with Session(self.engine) as db:
            self.id=self.uc(db).create({'name':'Fictitious Original'}).id
            self.other=self.uc(db).create({'name':'Fictitious Other'}).id
            dentist=db.get(DentistModel,self.fixture.dentists[0])
            dentist.specialty='Fictitious Original'
            db.commit()

    def uc(self, db): return SpecialtyUseCases(SqlAlchemySpecialtyRepository(db))

    def test_two_drafts_keep_matching_name_and_activation(self):
        gate=Barrier(2,timeout=15)
        def worker(index):
            with Session(self.engine) as db:
                current=self.uc(db).get(self.id)
                gate.wait()
                try:
                    self.uc(db).update(self.id,{'version':current.version,'name':f'Winner {index}','active':bool(index)})
                    return ('ok',index)
                except ConflictError as error:
                    self.assertEqual(error.code,'stale_version')
                    return ('conflict',index)
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
        self.assertEqual(sorted(status for status,_ in results),['conflict','ok'])
        winner=next(index for status,index in results if status=='ok')
        with Session(self.engine) as db:
            current=self.uc(db).get(self.id)
            self.assertEqual((current.version,current.name,current.active),(2,f'Winner {winner}',bool(winner)))

    def test_stale_activation_and_partial_review(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.update(self.id,{'version':1,'name':'Renamed','active':False})
            with self.assertRaises(ConflictError) as caught:
                uc.update(self.id,{'version':1,'name':'Fictitious Original','active':True})
            self.assertEqual(caught.exception.code,'stale_version')
            current=uc.update(self.id,{'version':2,'name':'Reviewed'})
            self.assertEqual((current.version,current.name,current.active),(3,'Reviewed',False))

    def test_duplicate_update_rolls_back_then_same_version_can_be_corrected(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            with self.assertRaises(ConflictError) as caught:
                uc.update(self.id,{'version':1,'name':' Fictitious Other ','active':False})
            self.assertEqual(caught.exception.code,'specialty_name_exists')
            current=uc.get(self.id)
            self.assertEqual((current.version,current.name,current.active),(1,'Fictitious Original',True))
            current=uc.update(self.id,{'version':1,'name':'Corrected','active':False})
            self.assertEqual((current.version,current.name,current.active),(2,'Corrected',False))
            with self.assertRaises(ConflictError) as stale:
                uc.update(self.id,{'version':1,'name':'Fictitious Other'})
            self.assertEqual(stale.exception.code,'stale_version')

    def test_duplicate_create_rolls_back_and_session_remains_usable(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            with self.assertRaises(ConflictError) as caught: uc.create({'name':'Fictitious Original'})
            self.assertEqual(caught.exception.code,'specialty_name_exists')
            self.assertEqual(uc.list(None,100,0)[1],2)
            self.assertEqual(uc.create({'name':'Corrected new'}).version,1)

    def test_two_records_cannot_claim_same_name(self):
        gate=Barrier(2,timeout=15)
        def worker(id):
            with Session(self.engine) as db:
                gate.wait()
                try:
                    self.uc(db).update(id,{'version':1,'name':'Shared name','active':False})
                    return ('ok',id)
                except ConflictError as error:
                    self.assertEqual(error.code,'specialty_name_exists')
                    return ('conflict',id)
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[self.id,self.other]))
        self.assertEqual(sorted(status for status,_ in results),['conflict','ok'])
        with Session(self.engine) as db:
            for status,id in results:
                row=self.uc(db).get(id)
                self.assertEqual(row.version,2 if status=='ok' else 1)
                self.assertEqual(row.active,status!='ok')
                self.assertEqual(row.name,'Shared name' if status=='ok' else ('Fictitious Original' if id==self.id else 'Fictitious Other'))

    def test_noop_retry_list_and_deleted_target(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            self.assertEqual(uc.update(self.id,{'version':1}).version,2)
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':1})
            self.assertEqual(next(row.version for row in uc.list(None,100,0)[0] if row.id==self.id),2)
            uc.delete(self.id, 2)
            with self.assertRaises(NotFoundError): uc.update(self.id,{'version':2,'name':'Deleted'})

    def test_invalid_preconditions(self):
        for data in ({},{'version':None},{'version':0},{'version':-1},{'version':True},{'version':'1'},{'version':1.1}):
            with self.subTest(data=data), self.assertRaises(SchemaValidationError): SpecialtyUpdateRequest.model_validate(data)

    def test_non_unique_integrity_failure_is_not_reported_as_duplicate(self):
        with Session(self.engine) as db:
            with self.assertRaises(IntegrityError): self.uc(db).update(self.id,{'version':1,'active':None,'name':'Invalid'})
            current=self.uc(db).get(self.id)
            self.assertEqual((current.version,current.name,current.active),(1,'Fictitious Original',True))

    def test_catalog_edits_do_not_rewrite_dentist_text_or_version(self):
        with Session(self.engine) as db:
            before=db.execute(select(DentistModel.id,DentistModel.specialty,DentistModel.version).order_by(DentistModel.id)).all()
            self.uc(db).update(self.id,{'version':1,'name':'Renamed','active':False})
            self.assertEqual(before,db.execute(select(DentistModel.id,DentistModel.specialty,DentistModel.version).order_by(DentistModel.id)).all())

    def test_migration_preserves_catalog_and_dentists_and_enforces_positive_version(self):
        self.assertEqual(self.fixture.migrate('downgrade','0017_procedure_version').returncode,0)
        def snapshot():
            with self.engine.connect() as db:
                return (db.execute(text("SELECT (to_jsonb(s)-'version')::text FROM specialties s ORDER BY id")).scalars().all(),
                    db.execute(text('SELECT row_to_json(d)::text FROM dentists d ORDER BY id')).scalars().all())
        before=snapshot()
        self.assertEqual(self.fixture.migrate('upgrade','head').returncode,0)
        self.assertEqual(before,snapshot())
        with Session(self.engine) as db:
            self.assertEqual(db.scalars(select(SpecialtyModel.version)).all(),[1,1])
            with self.assertRaises(IntegrityError): db.execute(text('UPDATE specialties SET version=0'))
            db.rollback()
            self.assertEqual(db.scalars(select(SpecialtyModel.version)).all(),[1,1])
