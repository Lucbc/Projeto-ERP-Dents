"""Patient state, exam-set preconditions and durable cleanup in isolated schemas."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4
import unittest
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from src.adapters.db.repositories.patient_deletion import exams_fingerprint
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository as Patients
from src.adapters.db.repositories.exam_repository import SqlAlchemyExamRepository as Exams
from src.adapters.db.models.models import PatientModel, ExamModel, ExamFileDeletionModel
from src.adapters.db.exam_cleanup import process_exam_deletions
from src.core.domain.exceptions import ConflictError, ForbiddenError, ValidationError
from test_exams import ExamFixture, PNG


class FingerprintTests(unittest.TestCase):
    def test_canonical_order_timezone_identity_metadata_and_empty_set(self):
        patient=uuid4()
        first=SimpleNamespace(id=uuid4(), original_filename='fictitious.png', stored_filename='first.png',
            mime_type='image/png', size_bytes=12, uploaded_at=datetime(2030,1,1,tzinfo=timezone.utc), notes=None)
        second=SimpleNamespace(**{**vars(first),'id':uuid4(),'stored_filename':'second.png'})
        initial=exams_fingerprint(patient,[first,second])
        self.assertEqual(initial,exams_fingerprint(patient,[second,first]))
        second.uploaded_at=second.uploaded_at.astimezone(timezone(timedelta(hours=-3)))
        self.assertEqual(initial,exams_fingerprint(patient,[first,second]))
        for field,value in [('notes',''),('id',uuid4()),('stored_filename','replacement.png'),('size_bytes',13)]:
            changed=SimpleNamespace(**{**vars(second),field:value})
            self.assertNotEqual(initial,exams_fingerprint(patient,[first,changed]))
        self.assertNotEqual(exams_fingerprint(patient,[]),exams_fingerprint(uuid4(),[]))


class PatientDeletionTests(ExamFixture):
    def preview(self, db=None, version=1):
        return Patients(db or self.db).deletion_preview(self.patient.id,version,can_delete_exams=True)

    def remove(self, db, preview):
        return Patients(db).delete(self.patient.id,preview['version'],preview['exams_fingerprint'],can_delete_exams=True)

    def test_stale_cached_patient_and_exam_set_rejected_without_queue_or_byte_changes(self):
        self.upload(); old=self.preview()
        self.db.get(PatientModel,self.patient.id)
        with Session(self.engine) as other:
            Patients(other).update(self.patient.id,{'version':1,'notes':'Fictitious edit'})
        with self.assertRaises(ConflictError) as result: self.remove(self.db,old)
        self.assertEqual(result.exception.code,'stale_version')
        current=self.preview(version=2)
        self.upload()
        with self.assertRaises(ConflictError) as result: self.remove(self.db,current)
        self.assertEqual(result.exception.code,'stale_exams')
        self.assertEqual(len(self.files()),2)
        self.assertEqual(list(self.db.scalars(select(ExamFileDeletionModel))),[])

    def test_same_count_replacement_and_permissions_are_checked_again(self):
        original=self.upload(); before=self.preview()
        self.exams.delete(original.id); self.upload()
        with self.assertRaises(ConflictError) as error: self.remove(self.db,before)
        self.assertEqual(error.exception.code,'stale_exams')
        for action in (lambda: self.patients.deletion_preview(self.patient.id,1),
                       lambda: self.patients.delete(self.patient.id,1,self.preview()['exams_fingerprint'])):
            with self.assertRaises(ForbiddenError): action()
        self.assertIsNotNone(self.patients.get(self.patient.id))

    def test_empty_patient_needs_no_exam_permission_preview_releases_lock_and_delete_has_no_implicit_preview(self):
        preview=self.patients.deletion_preview(self.patient.id,1)
        self.assertFalse(self.db.in_transaction())
        self.assertEqual(preview['exam_count'],0)
        with Session(self.engine) as other:
            other.execute(select(PatientModel).where(PatientModel.id==self.patient.id).with_for_update(nowait=True))
        for version,fingerprint in [(True,preview['exams_fingerprint']),(0,preview['exams_fingerprint']),(1,''),(1,None)]:
            with self.assertRaises(ValidationError): self.patients.delete(self.patient.id,version,fingerprint)
        self.assertTrue(self.patients.delete(self.patient.id,1,preview['exams_fingerprint']))
        self.assertFalse(self.patients.delete(self.patient.id,1,preview['exams_fingerprint']))
        self.assertIsNone(self.patients.deletion_preview(self.patient.id,1))

    def test_refused_commit_and_disk_failure_preserve_durable_cleanup_and_bytes(self):
        exam=self.upload(); preview=self.preview()
        with patch.object(self.db,'commit',side_effect=RuntimeError('fictitious failure')):
            with self.assertRaises(RuntimeError): self.remove(self.db,preview)
        self.assertIsNotNone(self.patients.get(self.patient.id))
        self.assertIsNotNone(self.exams.get(exam.id))
        self.assertEqual(list(self.db.scalars(select(ExamFileDeletionModel))),[])
        self.assertEqual(self.files()[0].read_bytes(),PNG)
        self.remove(self.db,preview)
        with patch.object(self.storage,'delete_file',side_effect=OSError('fictitious disk failure')):
            self.assertEqual(process_exam_deletions(self.db,self.storage)['pending_failures'],1)
        self.assertEqual(self.files()[0].read_bytes(),PNG)
        with Session(self.engine) as other:
            self.assertEqual(process_exam_deletions(other,self.storage)['removed'],1)
        self.assertEqual(self.files(),[])

    def test_more_than_one_cleanup_batch_survives_patient_cascade(self):
        # Distinct real files and rows exercise durable remainder after the request's 100 jobs.
        for _ in range(101): self.upload()
        preview=self.preview(); self.remove(self.db,preview)
        self.assertEqual(process_exam_deletions(self.db,self.storage,limit=100)['removed'],100)
        self.assertEqual(len(self.files()),1)
        with Session(self.engine) as other:
            self.assertEqual(process_exam_deletions(other,self.storage)['removed'],1)
        self.assertEqual(self.files(),[])

    def test_edit_upload_delete_and_exam_delete_races_have_consistent_outcomes(self):
        for action in ('edit','upload','delete','exam_delete'):
            with self.subTest(action=action):
                self.patient=self.patients.create({'full_name':'Fictitious race patient'})
                exam=self.upload() if action=='exam_delete' else None
                preview=self.preview(); barrier=Barrier(2,timeout=15)
                self.db.rollback()
                def deleting():
                    with Session(self.engine) as db:
                        barrier.wait()
                        try: return 'deleted' if self.remove(db,preview) else 'absent'
                        except ConflictError: return 'conflict'
                def competing():
                    with Session(self.engine) as db:
                        barrier.wait()
                        try:
                            if action=='edit': return 'changed' if Patients(db).update(self.patient.id,{'version':1,'notes':'Fictitious'}) else 'absent'
                            if action=='delete': return 'deleted' if self.remove(db,preview) else 'absent'
                            if action=='exam_delete': return 'changed' if Exams(db).delete(exam.id) else 'absent'
                            Exams(db).create({'patient_id':self.patient.id,'original_filename':'fictitious.png',
                                'stored_filename':uuid4().hex+'.png','mime_type':'image/png','size_bytes':len(PNG)})
                            return 'changed'
                        except ConflictError: return 'conflict'
                with ThreadPoolExecutor(2) as pool:
                    first=pool.submit(deleting); second=pool.submit(competing)
                    outcomes=(first.result(),second.result())
                if action=='delete': self.assertEqual(sorted(outcomes),['absent','deleted'])
                elif outcomes[0]=='deleted': self.assertIn(outcomes[1],('absent','conflict'))
                else: self.assertEqual(outcomes,('conflict','changed'))
                present=self.patients.get(self.patient.id)
                if outcomes[0]=='deleted' or action=='delete': self.assertIsNone(present)
                else: self.assertIsNotNone(present)
                self.db.rollback()

import os
from threading import Event
from sqlalchemy.exc import DBAPIError
from src.core.domain.exceptions import NotFoundError
from src.api.error_boundary import failure_response
import test_financial_concurrency as financial

def delete_reviewed_patient(db, id):
    repo=Patients(db)
    preview=repo.deletion_preview(id,1,can_delete_exams=True)
    return repo.delete(id,1,preview['exams_fingerprint'],can_delete_exams=True)

@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PatientFinancialDeletionTests(unittest.TestCase):
    def setUp(self):
        self.fixture=financial.FinancialConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups); self.fixture.setUp()
        self.engine=self.fixture.engine; self.id=self.fixture.fixture.patients[1]
        self.actor=SimpleNamespace(id=uuid4(),name='Fictitious operator')

    def data(self,id=None,paid=False):
        return {**self.fixture.data(), 'appointment_id':None, 'patient_id':id or self.id,
                'status':'paid' if paid else 'pending', 'idempotency_key':uuid4()}

    def test_consultations_all_states_reject_cascade_and_rollback_cleanup(self):
        appointment=self.fixture.fixture.insert(self.fixture.fixture.data(patient=1,hour=5))
        with Session(self.engine) as db:
            Exams(db).create({'patient_id':self.id,'original_filename':'fictitious.png',
                'stored_filename':'fictitious.png','mime_type':'image/png','size_bytes':12})
            for state in ('scheduled','confirmed','completed','cancelled'):
                db.execute(text('UPDATE appointments SET status=:status WHERE id=:id'),{'status':state,'id':appointment})
                db.commit()
                with self.assertRaises(ConflictError) as result: delete_reviewed_patient(db,self.id)
                self.assertEqual(result.exception.code,'linked_record')
                self.assertEqual(len(Exams(db).list_by_patient(self.id)),1)
                self.assertEqual(list(db.scalars(select(ExamFileDeletionModel))),[])

    def test_incoming_appointment_creation_and_reassignment_race_deletion(self):
        for reassign in (False,True):
            with Session(self.engine) as db:
                target=Patients(db).create({'full_name':'Fictitious appointment target'})
                before=db.execute(text('SELECT patient_id,version FROM appointments WHERE id=:id'),{'id':self.fixture.appointments[0]}).one()
            gate=Barrier(2,timeout=15)
            def link():
                with Session(self.engine) as db:
                    gate.wait()
                    try:
                        if reassign:
                            db.execute(text('UPDATE appointments SET patient_id=:patient,version=version+1 WHERE id=:id'),
                                {'patient':target.id,'id':self.fixture.appointments[0]})
                        else:
                            from src.adapters.db.models.models import AppointmentModel
                            db.add(AppointmentModel(**{**self.fixture.fixture.data(hour=7),'patient_id':target.id}))
                        db.commit(); return 'linked'
                    except DBAPIError: db.rollback(); return 'rejected'
            def delete():
                with Session(self.engine) as db:
                    gate.wait()
                    try: delete_reviewed_patient(db,target.id); return 'deleted'
                    except ConflictError: return 'rejected'
            with ThreadPoolExecutor(2) as pool:
                first=pool.submit(link); second=pool.submit(delete); results=(first.result(),second.result())
            self.assertIn(results,(('linked','rejected'),('rejected','deleted')))
            if reassign and results[0]=='rejected':
                with self.engine.connect() as db:
                    self.assertEqual(db.execute(text('SELECT patient_id,version FROM appointments WHERE id=:id'),
                        {'id':self.fixture.appointments[0]}).one(),before)

    def test_ambiguous_patient_commit_keeps_cleanup_intent_without_restoring_deleted_metadata(self):
        with Session(self.engine) as db:
            Exams(db).create({'patient_id':self.id,'original_filename':'fictitious.png',
                'stored_filename':'fictitious.png','mime_type':'image/png','size_bytes':12})
            repo=Patients(db); preview=repo.deletion_preview(self.id,1,can_delete_exams=True)
            commit=db.commit
            def ambiguous():
                commit(); raise RuntimeError('fictitious lost acknowledgement')
            with patch.object(db,'commit',side_effect=ambiguous):
                with self.assertRaises(RuntimeError): repo.delete(self.id,1,preview['exams_fingerprint'],can_delete_exams=True)
            self.assertIsNone(repo.get(self.id))
            self.assertEqual(Exams(db).list_by_patient(self.id),[])
            self.assertEqual(len(list(db.scalars(select(ExamFileDeletionModel)))),1)

    def test_pending_charge_commit_before_deletion_allows_both_and_keeps_origin(self):
        gate=Barrier(2,timeout=15)
        def create():
            with Session(self.engine) as db:
                entry=self.fixture.use_case(db).create(self.data()); db.commit(); gate.wait(); return entry
        def delete():
            gate.wait()
            with Session(self.engine) as db: return delete_reviewed_patient(db,self.id)
        with ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(create); b=pool.submit(delete); entry=a.result(); self.assertTrue(b.result())
        with Session(self.engine) as db:
            current=self.fixture.use_case(db).get(entry.id)
            self.assertIsNone(current.patient_id)
            for field in ('version','status','total_cents','reference_snapshot'):
                self.assertEqual(getattr(current,field),getattr(entry,field))

    def test_delete_after_financial_validation_rolls_back_charge_event_and_receipt(self):
        for paid in (False,True):
            with Session(self.engine) as db: target=Patients(db).create({'full_name':'Fictitious charge race'})
            gate=Barrier(2,timeout=15); deleted=Event()
            def create():
                with Session(self.engine) as db:
                    uc=self.fixture.use_case(db); repo=uc.financial_repository; method='create_paid' if paid else 'create'; original=getattr(repo,method)
                    def delayed(*args,**kwargs):
                        gate.wait(); self.assertTrue(deleted.wait(15)); return original(*args,**kwargs)
                    setattr(repo,method,delayed)
                    with self.assertRaises((DBAPIError,ConflictError,NotFoundError)): uc.create(self.data(target.id,paid),actor=self.actor)
                    db.rollback()
            def delete():
                gate.wait()
                try:
                    with Session(self.engine) as db: self.assertTrue(delete_reviewed_patient(db,target.id))
                finally: deleted.set()
            with ThreadPoolExecutor(max_workers=2) as pool:
                a=pool.submit(create); b=pool.submit(delete); a.result(); b.result()
            with self.engine.connect() as db:
                for table in ('financial_entries','financial_payments','financial_operations','financial_entry_references','financial_payment_references'):
                    self.assertEqual(db.scalar(text(f'SELECT count(*) FROM {table}')),0)

    def test_payment_lock_inversion_is_safe_and_post_delete_payment_has_no_current_patient(self):
        with Session(self.engine) as db:
            uc=self.fixture.use_case(db); entry=uc.create(self.data())
            db.execute(text('SELECT id FROM financial_entries WHERE id=:id FOR UPDATE'),{'id':entry.id})
            gate=Barrier(2,timeout=15)
            def delete():
                with Session(self.engine) as other:
                    other.scalar(select(PatientModel).where(PatientModel.id==self.id).with_for_update()); gate.wait()
                    return Patients(other).delete(self.id,1,exams_fingerprint(self.id,[]),can_delete_exams=True)
            with ThreadPoolExecutor(max_workers=1) as pool:
                task=pool.submit(delete); gate.wait()
                with self.assertRaises(DBAPIError) as error: uc.mark_as_paid(entry.id,1,idempotency_key=uuid4(),actor=self.actor)
                db.rollback(); self.assertEqual(failure_response(error.exception,'fictitious-test').status_code,409)
                self.assertTrue(task.result(timeout=15))
            self.assertEqual(uc.payments(entry.id),[])
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_operations')),0)
            result=uc.mark_as_paid(entry.id,1,idempotency_key=uuid4(),actor=self.actor)
            self.assertEqual(result['payment']['reference_snapshot']['patient'],{'id':None,'name':None})
            self.assertEqual(result['entry'].reference_snapshot['patient']['id'],str(self.id))
