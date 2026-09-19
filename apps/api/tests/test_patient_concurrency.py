"""Optimistic patient edits on independent PostgreSQL sessions, fictitious data only."""
from concurrent.futures import ThreadPoolExecutor
import os
from threading import Barrier
import unittest
from uuid import uuid4
from pydantic import ValidationError as SchemaValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.api.schemas.schemas import PatientUpdateRequest
from src.core.domain.exceptions import ConflictError, NotFoundError
from src.core.use_cases.patient_use_cases import PatientUseCases


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PatientConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.id = self.fixture.patients[0]

    def uc(self, db): return PatientUseCases(fixture.SqlAlchemyPatientRepository(db))

    def test_two_loaded_drafts_cannot_both_save(self):
        gate = Barrier(2, timeout=15)
        def worker(note):
            with Session(self.engine) as db:
                current = self.uc(db).get(self.id)
                gate.wait()
                try:
                    result = self.uc(db).update(self.id, {'version':current.version,'notes':note})
                    return ('ok',result.notes)
                except ConflictError: return ('conflict',None)
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,['Draft A','Draft B']))
        self.assertEqual(sorted(status for status,_ in results), ['conflict','ok'])
        with Session(self.engine) as db:
            current=self.uc(db).get(self.id)
            self.assertEqual(current.version,2)
            self.assertEqual(current.notes,next(note for status,note in results if status=='ok'))

    def test_stale_full_draft_preserves_other_operators_fields_and_reload_can_save(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            original=uc.get(self.id)
            saved=uc.update(self.id,{'version':original.version,'phone':'11111111111','notes':'Operator A'})
            with self.assertRaises(ConflictError):
                uc.update(self.id,{'version':original.version,'phone':None,'notes':'Operator B'})
            current=uc.get(self.id)
            self.assertEqual(current.phone,'11111111111')
            self.assertEqual(current.notes,'Operator A')
            result=uc.update(self.id,{'version':current.version,'notes':'Reviewed B'})
            self.assertEqual(result.version,3)
            self.assertEqual(result.phone,'11111111111')
            self.assertEqual(result.notes,'Reviewed B')

    def test_noop_edit_advances_version_and_duplicate_retry_conflicts(self):
        with Session(self.engine) as db:
            uc=self.uc(db)
            current=uc.get(self.id)
            result=uc.update(self.id,{'version':current.version,'full_name':current.full_name})
            self.assertEqual(result.version,2)
            with self.assertRaises(ConflictError): uc.update(self.id,{'version':1})

    def test_missing_null_noninteger_or_nonpositive_version_is_rejected(self):
        for data in ({}, {'version':None}, {'version':0}, {'version':-1}, {'version':True}, {'version':'1'}, {'version':1.1}):
            with self.subTest(data=data), self.assertRaises(SchemaValidationError):
                PatientUpdateRequest.model_validate(data)

    def test_deleted_patient_returns_not_found(self):
        with Session(self.engine) as db:
            with self.assertRaises(NotFoundError): self.uc(db).update(uuid4(),{'version':1,'notes':'Draft'})

    def test_failed_edit_does_not_consume_version(self):
        with Session(self.engine) as db:
            with self.assertRaises(IntegrityError): self.uc(db).update(self.id,{'version':1,'active':None})
            db.rollback()
            self.assertEqual(self.uc(db).get(self.id).version,1)

    def test_list_exposes_latest_version(self):
        with Session(self.engine) as db:
            self.uc(db).update(self.id,{'version':1,'notes':'Changed'})
            rows,_=self.uc(db).list(None,100,0)
            self.assertEqual(next(row.version for row in rows if row.id==self.id),2)

    def test_migration_preserves_legacy_fields_and_initializes_version(self):
        self.assertEqual(self.fixture.migrate('downgrade','0013_financial_generation').returncode,0)
        with self.engine.connect() as db:
            before=db.execute(text('SELECT row_to_json(p)::text FROM patients p ORDER BY id')).scalars().all()
        self.assertEqual(self.fixture.migrate('upgrade','head').returncode,0)
        with self.engine.connect() as db:
            # JSONB canonical form avoids field ordering differences after adding a column.
            import json
            after=db.execute(text("SELECT (to_jsonb(p)-'version')::text FROM patients p ORDER BY id")).scalars().all()
            self.assertEqual([json.loads(row) for row in before],[json.loads(row) for row in after])
            self.assertEqual(db.scalar(text('SELECT min(version) FROM patients')),1)
