"""Appointment version and procedure links commit together on PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from threading import Barrier
import unittest
from uuid import uuid4
from pydantic import ValidationError as SchemaValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.models.models import ProcedureModel
from src.api.schemas.schemas import AppointmentUpdateRequest
from src.core.domain.exceptions import ConflictError, NotFoundError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class AppointmentVersionTests(unittest.TestCase):
    def setUp(self):
        self.fixture=fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine=self.fixture.engine
        self.id=self.fixture.insert(self.fixture.data())
        self.procedures=[uuid4(),uuid4()]
        with Session(self.engine) as db:
            db.add_all([ProcedureModel(id=id,name='Fictitious procedure',price_cents=1000) for id in self.procedures])
            db.commit()

    def uc(self, db):
        return fixture.AppointmentUseCases(fixture.SqlAlchemyAppointmentRepository(db),
            fixture.SqlAlchemyPatientRepository(db),fixture.SqlAlchemyDentistRepository(db),
            fixture.SqlAlchemyProcedureRepository(db))

    def test_race_after_both_validations_keeps_winning_fields_and_links(self):
        gate=Barrier(2,timeout=15)
        def worker(index):
            with Session(self.engine) as db:
                uc=self.uc(db)
                original=uc.appointment_repository.update
                def synchronized(*args):
                    gate.wait()
                    return original(*args)
                uc.appointment_repository.update=synchronized
                try:
                    uc.update(self.id,{'version':1,'notes':str(index),'procedure_ids':[self.procedures[index]]})
                    return ('ok',index)
                except ConflictError: return ('conflict',index)
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,[0,1]))
        self.assertEqual(sorted(status for status,_ in results),['conflict','ok'])
        winner=next(index for status,index in results if status=='ok')
        with Session(self.engine) as db:
            current=self.uc(db).get(self.id)
            self.assertEqual((current.version,current.notes,current.procedure_ids),(2,str(winner),[self.procedures[winner]]))

    def test_stale_cancellation_or_reactivation_cannot_change_current_status(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.update(self.id,{'version':1,'status':'confirmed'})
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':1,'status':'cancelled'})
            self.assertEqual(uc.get(self.id).status.value,'confirmed')
            uc.update(self.id,{'version':2,'status':'cancelled'})
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':2,'status':'scheduled'})
            self.assertEqual(uc.get(self.id).status.value,'cancelled')

    def test_reload_and_partial_edit_preserve_fields_and_procedures(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            saved=uc.update(self.id,{'version':1,'notes':'First','procedure_ids':self.procedures})
            updated=uc.update(self.id,{'version':saved.version,'notes':'Reviewed'})
            self.assertEqual(updated.version,3)
            self.assertEqual(set(updated.procedure_ids),set(self.procedures))
            self.assertEqual(updated.start_at,saved.start_at)

    def test_failed_overlap_keeps_version_notes_and_links(self):
        self.fixture.insert(self.fixture.data(hour=2))
        with Session(self.engine) as db:
            uc=self.uc(db)
            saved=uc.update(self.id,{'version':1,'notes':'Original','procedure_ids':[self.procedures[0]]})
            target=self.fixture.data(hour=2)
            with self.assertRaises(IntegrityError):
                uc.appointment_repository.update(self.id,{'version':saved.version,'start_at':target['start_at'],
                    'end_at':target['end_at'],'notes':'Rejected','procedure_ids':[self.procedures[1]]})
            db.rollback()
            current=uc.get(self.id)
            self.assertEqual((current.version,current.notes,current.procedure_ids),(2,'Original',[self.procedures[0]]))

    def test_failed_procedure_write_rolls_back_row_and_version(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            with self.assertRaises(IntegrityError):
                uc.appointment_repository.update(self.id,{'version':1,'notes':'Rejected','procedure_ids':[uuid4()]})
            db.rollback()
            current=uc.get(self.id)
            self.assertEqual((current.version,current.notes,current.procedure_ids),(1,None,[]))

    def test_noop_edit_consumes_version_and_repeated_save_conflicts(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            self.assertEqual(uc.update(self.id,{'version':1}).version,2)
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':1})

    def test_invalid_preconditions_rejected(self):
        for data in ({},{'version':None},{'version':0},{'version':True},{'version':'1'},{'version':1.1}):
            with self.subTest(data=data), self.assertRaises(SchemaValidationError):
                AppointmentUpdateRequest.model_validate(data)

    def test_deleted_target_is_not_found(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.delete(self.id)
            with self.assertRaises(NotFoundError): uc.update(self.id,{'version':1,'notes':'Stale'})

    def test_list_returns_latest_version(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            uc.update(self.id,{'version':1})
            rows=uc.appointment_repository.list(None,None,None,None)
            self.assertEqual(rows[0].version,2)

    def test_migration_preserves_bookings_and_procedure_links(self):
        with Session(self.engine) as db:
            self.uc(db).update(self.id,{'version':1,'procedure_ids':self.procedures})
        self.assertEqual(self.fixture.migrate('downgrade','0014_patient_version').returncode,0)
        def snapshot():
            with self.engine.connect() as db:
                return [db.execute(text(query)).scalars().all() for query in (
                    "SELECT (to_jsonb(a)-'version')::text FROM appointments a ORDER BY id",
                    'SELECT to_jsonb(p)::text FROM appointment_procedures p ORDER BY appointment_id,procedure_id')]
        before=snapshot()
        self.assertEqual(self.fixture.migrate('upgrade','head').returncode,0)
        self.assertEqual(before,snapshot())
        with Session(self.engine) as db: self.assertEqual(self.uc(db).get(self.id).version,1)
