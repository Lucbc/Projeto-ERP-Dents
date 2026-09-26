"""Versioned dentist deletion and restrictive account FK in private schemas."""
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
import test_appointment_concurrency as agenda
import test_financial_concurrency as financial
from src.adapters.db.models.models import DentistModel, UserModel, AuthSessionModel
from src.adapters.db.repositories.dentist_repository import SqlAlchemyDentistRepository as Repository
from src.core.domain.exceptions import ConflictError, ValidationError, NotFoundError
from src.api.error_boundary import failure_response


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class DentistDeletionTests(unittest.TestCase):
    def setUp(self):
        self.fixture=agenda.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups); self.fixture.setUp()
        self.engine=self.fixture.engine; self.id=self.fixture.dentists[0]

    def user(self, db, dentist_id, active=True):
        user=UserModel(name='Fictitious associated user',email=uuid4().hex+'@example.com',
                       role='dentist',dentist_id=dentist_id,password_hash='fictitious-only',is_active=active)
        db.add(user); db.commit(); return user.id

    def test_migration_preserves_rows_orphans_and_sessions_and_handles_actual_fk_name(self):
        with Session(self.engine) as db:
            user_id=self.user(db,self.id); self.user(db,None)
            db.add(AuthSessionModel(id=uuid4(),user_id=user_id,expires_at=datetime.now(timezone.utc)+timedelta(days=1)))
            db.commit()
        with self.engine.begin() as db:
            name=next(fk['name'] for fk in inspect(db).get_foreign_keys('users') if fk['constrained_columns']==['dentist_id'])
            quoted=db.dialect.identifier_preparer.quote(name)
            db.execute(text(f'ALTER TABLE users RENAME CONSTRAINT {quoted} TO fictitious_account_dentist_fk'))
        def rows():
            with self.engine.connect() as db:
                return {table:db.execute(text(f'SELECT to_jsonb(t)::text FROM "{table}" t ORDER BY to_jsonb(t)::text')).scalars().all()
                        for table in inspect(db).get_table_names() if table!='alembic_version'}
        before=rows()
        self.assertEqual(self.fixture.migrate('downgrade','0021_financial_references').returncode,0)
        self.assertEqual(rows(),before)
        with self.engine.connect() as db:
            fk=next(f for f in inspect(db).get_foreign_keys('users') if f['constrained_columns']==['dentist_id'])
            self.assertEqual(fk['options']['ondelete'],'SET NULL')
        self.assertEqual(self.fixture.migrate('upgrade','head').returncode,0)
        self.assertEqual(rows(),before)
        with self.assertRaises(DBAPIError), self.engine.begin() as db:
            db.execute(text('DELETE FROM dentists WHERE id=:id'),{'id':self.id})
        self.assertEqual(rows(),before)

    def test_old_orm_version_cannot_remove_new_schedule(self):
        schedule=[{'day_of_week':'monday','start_time':'09:00','end_time':'17:00'}]
        with Session(self.engine) as db:
            old=db.get(DentistModel,self.id); repo=Repository(db)
            with Session(self.engine) as other: Repository(other).update(self.id,{'version':1,'availability':schedule})
            self.assertEqual(old.version,1)
            for version in (None,0,-1,True,'1'):
                with self.assertRaises(ValidationError): repo.delete(self.id,version)
            with self.assertRaises(ConflictError) as error: repo.delete(self.id,1)
            self.assertEqual(error.exception.code,'stale_version')
            self.assertEqual(repo.get(self.id).availability,schedule)
            self.assertTrue(repo.delete(self.id,2)); self.assertFalse(repo.delete(self.id,2))

    def race(self,both_delete):
        gate=Barrier(2,timeout=15)
        def worker(index):
            with Session(self.engine) as db:
                repo=Repository(db); self.assertEqual(repo.get(self.id).version,1); gate.wait()
                try:
                    return bool(repo.delete(self.id,1) if both_delete or index else repo.update(self.id,{'version':1,'availability':[]}))
                except ConflictError: return False
        with ThreadPoolExecutor(max_workers=2) as pool: self.assertEqual(sum(pool.map(worker,range(2))),1)

    def test_edit_schedule_against_delete(self): self.race(False)
    def test_delete_against_delete(self): self.race(True)

    def test_active_and_inactive_accounts_added_after_read_block_without_mutation(self):
        for active in (True,False):
            with Session(self.engine) as db:
                repo=Repository(db); before=repo.get(self.id)
                with Session(self.engine) as other: user_id=self.user(other,self.id,active)
                with self.assertRaises(ConflictError) as error: repo.delete(self.id,1)
                self.assertEqual(error.exception.code,'linked_record')
                self.assertEqual(repo.get(self.id),before)
                self.assertEqual(db.get(UserModel,user_id).dentist_id,self.id)
                db.delete(db.get(UserModel,user_id)); db.commit()
        with Session(self.engine) as db: self.assertTrue(Repository(db).delete(self.id,1))

    def test_appointments_in_all_states_block_and_preserve_links(self):
        id=self.fixture.insert(self.fixture.data())
        for status in ('scheduled','confirmed','completed','cancelled'):
            with Session(self.engine) as db:
                db.execute(text('UPDATE appointments SET status=:status WHERE id=:id'),{'status':status,'id':id}); db.commit()
                with self.assertRaises(ConflictError) as error: Repository(db).delete(self.id,1)
                self.assertEqual(error.exception.code,'linked_record')
                self.assertEqual(db.scalar(text('SELECT dentist_id FROM appointments WHERE id=:id'),{'id':id}),self.id)

    def test_new_user_or_appointment_racing_deletion_never_leaves_orphan(self):
        for kind in ('user','appointment','reassign'):
            with self.subTest(kind=kind):
                with Session(self.engine) as db:
                    repo = Repository(db)
                    target=repo.create({'full_name':'Fictitious race dentist', 'availability':repo.get(self.id).availability})
                user_id=None
                if kind=='reassign':
                    with Session(self.engine) as db: user_id=self.user(db,self.id)
                gate=Barrier(2,timeout=15)
                def link():
                    with Session(self.engine) as db:
                        gate.wait()
                        try:
                            if kind=='user': self.user(db,target.id)
                            elif kind=='reassign':
                                db.execute(text('UPDATE users SET dentist_id=:target WHERE id=:id'),{'target':target.id,'id':user_id}); db.commit()
                            else:
                                data=self.fixture.data(); data['dentist_id']=target.id
                                agenda.SqlAlchemyAppointmentRepository(db).create(data)
                            return True
                        except DBAPIError as error:
                            db.rollback(); self.assertEqual(error.orig.sqlstate,'23503'); return False
                        except NotFoundError:
                            self.assertEqual(kind, 'appointment')
                            self.assertFalse(db.in_transaction())
                            return False
                def delete():
                    with Session(self.engine) as db:
                        gate.wait()
                        try: return Repository(db).delete(target.id,1)
                        except ConflictError as error:
                            self.assertEqual(error.code,'linked_record'); return False
                with ThreadPoolExecutor(max_workers=2) as pool:
                    a=pool.submit(link); b=pool.submit(delete); self.assertEqual(int(a.result())+int(b.result()),1)
                with self.engine.begin() as db:
                    self.assertEqual(db.scalar(text('SELECT count(*) FROM users u LEFT JOIN dentists d ON u.dentist_id=d.id WHERE u.dentist_id IS NOT NULL AND d.id IS NULL')),0)
                    self.assertEqual(db.scalar(text('SELECT count(*) FROM appointments a LEFT JOIN dentists d ON a.dentist_id=d.id WHERE d.id IS NULL')),0)
                    # Free the patient's slot for the next subcase.
                    db.execute(text('DELETE FROM appointments'))

    def test_reassignment_away_concurrent_with_delete_preserves_account(self):
        with Session(self.engine) as db: user_id=self.user(db,self.id)
        gate=Barrier(2,timeout=15)
        def reassign():
            with self.engine.begin() as db:
                gate.wait(); db.execute(text('UPDATE users SET dentist_id=:next WHERE id=:id'),{'next':self.fixture.dentists[1],'id':user_id})
        def delete():
            with Session(self.engine) as db:
                gate.wait()
                try: return Repository(db).delete(self.id,1)
                except ConflictError: return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(reassign); b=pool.submit(delete); a.result(); removed=b.result()
        with Session(self.engine) as db:
            self.assertEqual(db.get(UserModel,user_id).dentist_id,self.fixture.dentists[1])
            if not removed: self.assertTrue(Repository(db).delete(self.id,1))

    def test_appointment_reassignment_after_target_deletion_rolls_back_version_notes_and_links(self):
        id=self.fixture.insert(self.fixture.data())
        target=self.fixture.dentists[1]
        gate=Barrier(2,timeout=15); deleted=Event()
        def reassign():
            with Session(self.engine) as db:
                repo=agenda.SqlAlchemyAppointmentRepository(db); before=repo.get(id)
                gate.wait(); self.assertTrue(deleted.wait(15))
                with self.assertRaises(NotFoundError): repo.update(id,{'version':1,'dentist_id':target,'notes':'Rejected change'})
                self.assertFalse(db.in_transaction())
                self.assertEqual(repo.get(id),before)
        def delete():
            gate.wait()
            try:
                with Session(self.engine) as db: self.assertTrue(Repository(db).delete(target,1))
            finally: deleted.set()
        with ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(reassign); b=pool.submit(delete); a.result(); b.result()


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class DentistFinancialDeletionTests(unittest.TestCase):
    def setUp(self):
        self.fixture=financial.FinancialConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups); self.fixture.setUp()
        self.engine=self.fixture.engine; self.id=self.fixture.fixture.dentists[1]
        self.actor=SimpleNamespace(id=uuid4(),name='Fictitious operator')

    def data(self,id=None,paid=False):
        return {**self.fixture.data(), 'appointment_id':None, 'dentist_id':id or self.id,
                'status':'paid' if paid else 'pending', 'idempotency_key':uuid4()}

    def test_pending_charge_commit_before_deletion_allows_both_and_keeps_origin(self):
        gate=Barrier(2,timeout=15)
        def create():
            with Session(self.engine) as db:
                entry=self.fixture.use_case(db).create(self.data()); db.commit(); gate.wait(); return entry
        def delete():
            gate.wait()
            with Session(self.engine) as db: return Repository(db).delete(self.id,1)
        with ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(create); b=pool.submit(delete); entry=a.result(); self.assertTrue(b.result())
        with Session(self.engine) as db:
            current=self.fixture.use_case(db).get(entry.id)
            self.assertIsNone(current.dentist_id)
            for field in ('version','status','total_cents','reference_snapshot'):
                self.assertEqual(getattr(current,field),getattr(entry,field))

    def test_failed_linked_deletion_and_success_preserve_payment_reversal_and_receipts(self):
        with Session(self.engine) as db:
            uc=self.fixture.use_case(db); payload=self.data(paid=True); entry=uc.create(payload,actor=self.actor)
            first=uc.payments(entry.id)[0]
            pending=uc.reverse_payment(entry.id,1,first['id'],uuid4(),'Fictitious correction',self.actor)['entry']
            current=uc.mark_as_paid(entry.id,pending.version,idempotency_key=uuid4(),actor=self.actor)['entry']
            history=uc.payments(entry.id); db.commit()
            user=UserModel(name='Fictitious linked account',email='linked@example.com',role='dentist',dentist_id=self.id,password_hash='fictitious-only')
            db.add(user); db.commit()
            with self.assertRaises(ConflictError): Repository(db).delete(self.id,1)
            self.assertEqual(uc.get(entry.id).dentist_id,self.id)
            self.assertEqual(uc.payments(entry.id),history)
            db.delete(user); db.commit()
            self.assertTrue(Repository(db).delete(self.id,1))
            db.expire_all(); after=uc.get(entry.id)
            self.assertIsNone(after.dentist_id)
            for field in ('version','total_cents','status','active_payment_id','reference_snapshot'):
                self.assertEqual(getattr(after,field),getattr(current,field))
            self.assertEqual(uc.payments(entry.id),history)
            self.assertEqual(uc.create(payload,actor=self.actor).id,entry.id)

    def test_delete_after_financial_validation_rolls_back_charge_event_and_receipt(self):
        for paid in (False,True):
            with Session(self.engine) as db: target=Repository(db).create({'full_name':'Fictitious charge race'})
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
                    with Session(self.engine) as db: self.assertTrue(Repository(db).delete(target.id,1))
                finally: deleted.set()
            with ThreadPoolExecutor(max_workers=2) as pool:
                a=pool.submit(create); b=pool.submit(delete); a.result(); b.result()
            with self.engine.connect() as db:
                for table in ('financial_entries','financial_payments','financial_operations','financial_entry_references','financial_payment_references'):
                    self.assertEqual(db.scalar(text(f'SELECT count(*) FROM {table}')),0)

    def test_payment_lock_inversion_is_safe_and_post_delete_payment_has_no_current_dentist(self):
        with Session(self.engine) as db:
            uc=self.fixture.use_case(db); entry=uc.create(self.data())
            db.execute(text('SELECT id FROM financial_entries WHERE id=:id FOR UPDATE'),{'id':entry.id})
            gate=Barrier(2,timeout=15)
            def delete():
                with Session(self.engine) as other:
                    other.scalar(select(DentistModel).where(DentistModel.id==self.id).with_for_update()); gate.wait()
                    return Repository(other).delete(self.id,1)
            with ThreadPoolExecutor(max_workers=1) as pool:
                task=pool.submit(delete); gate.wait()
                with self.assertRaises(DBAPIError) as error: uc.mark_as_paid(entry.id,1,idempotency_key=uuid4(),actor=self.actor)
                db.rollback(); self.assertEqual(failure_response(error.exception,'fictitious-test').status_code,409)
                self.assertTrue(task.result(timeout=15))
            self.assertEqual(uc.payments(entry.id),[])
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_operations')),0)
            result=uc.mark_as_paid(entry.id,1,idempotency_key=uuid4(),actor=self.actor)
            self.assertEqual(result['payment']['reference_snapshot']['dentist'],{'id':None,'name':None})
            self.assertEqual(result['entry'].reference_snapshot['dentist']['id'],str(self.id))
