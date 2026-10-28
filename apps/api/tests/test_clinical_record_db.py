"""Clinical storage acceptance, only in disposable homologation schemas."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
from threading import Barrier
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import test_appointment_concurrency as fixture
from src.adapters.db.models.models import UserModel, AuthSessionModel, RolePermissionModel
from src.adapters.db.repositories.clinical_record_repository import SqlAlchemyClinicalRecordRepository
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ConflictError, ForbiddenError, UnauthorizedError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class ClinicalRecordDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.visit = self.fixture.insert(self.fixture.data())
        self.actor, self.session_id = uuid4(), uuid4()
        with Session(self.engine) as db:
            db.add(UserModel(id=self.actor, name='Clinical Fictitious Author', email='clinical@example.com',
                             role=UserRole.dentist, dentist_id=self.fixture.dentists[0], password_hash='fictitious'))
            db.flush()
            db.add(AuthSessionModel(id=self.session_id, user_id=self.actor,
                                    expires_at=datetime.now(timezone.utc)+timedelta(hours=1)))
            permission = db.get(RolePermissionModel, UserRole.dentist)
            permission.permissions = {**permission.permissions,
                'clinical_records': {'view': True, 'create': True, 'update': True, 'delete': False}}
            permission.version += 1
            db.execute(text('UPDATE patients SET allergies=:a,medical_history=:h,version=version+1 WHERE id=:id'),
                       {'a': 'Fictitious allergy', 'h': 'Fictitious history', 'id': self.fixture.patients[0]})
            db.commit()

    def call(self, action='create', target=None, key=None, **data):
        with Session(self.engine) as db:
            return SqlAlchemyClinicalRecordRepository(db).execute(action, target or self.visit,
                actor_id=self.actor, session_id=self.session_id, key=key or uuid4(), **data)

    def scalar(self, query, params=None):
        with self.engine.connect() as db:
            return db.scalar(text(query), params or {})

    def final(self):
        draft = self.call(text='Original fictional text\n')
        return self.call('finalize', draft.id, version=1)

    def race(self, calls):
        barrier = Barrier(2, timeout=15)
        def worker(call):
            barrier.wait()
            try:
                return call()
            except ConflictError:
                return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(worker, calls))

    def test_lifecycle_preserves_context_text_and_original_receipts(self):
        key = uuid4()
        draft = self.call(key=key, text='Original fictional text\n')
        saved = self.call('save', draft.id, version=1, text='Final fictional text\n')
        final_key = uuid4()
        final = self.call('finalize', saved.id, key=final_key, version=2)
        with self.engine.begin() as db:
            db.execute(text('UPDATE patients SET allergies=:a,version=version+1 WHERE id=:id'),
                       {'a':'Later fictitious value', 'id':draft.patient_id})
        add_key = uuid4()
        corrected = self.call('addendum', final.id, key=add_key, version=3, text='Correction', reason='Fictitious reason')
        self.assertEqual(corrected.text, 'Final fictional text\n')
        self.assertEqual(corrected.context.allergies, 'Fictitious allergy')
        self.assertEqual(corrected.finalized_at, final.finalized_at)
        self.assertEqual(self.call(key=key, text='Original fictional text\n'), draft)
        self.assertEqual(self.call('finalize', saved.id, key=final_key, version=2), final)
        self.assertEqual(self.call('addendum', final.id, key=add_key, version=3, text='Correction', reason='Fictitious reason'), corrected)
        with Session(self.engine) as db:
            current = SqlAlchemyClinicalRecordRepository(db).get(final.id, actor_id=self.actor, session_id=self.session_id)
        self.assertEqual(current, corrected)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_operations'), 4)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_addenda'), 1)

    def test_same_key_concurrent_creation_recovers_one_result(self):
        key = uuid4()
        results = self.race([lambda:self.call(key=key, text='Fictitious draft')]*2)
        self.assertEqual(results[0], results[1])
        self.assertNotEqual(results[0], 'conflict')
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_records'), 1)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_operations'), 1)

    def test_different_creation_keys_same_visit_have_one_winner(self):
        results = self.race([lambda:self.call(text='A'), lambda:self.call(text='B')])
        self.assertEqual(results.count('conflict'), 1)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_records'), 1)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_operations'), 1)

    def test_edit_and_finalization_race_has_one_winner(self):
        draft = self.call(text='Original')
        results = self.race([lambda:self.call('save', draft.id, version=1, text='Edited'),
                             lambda:self.call('finalize', draft.id, version=1)])
        self.assertEqual(results.count('conflict'), 1)
        self.assertEqual(self.scalar('SELECT version FROM clinical_records'), 2)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_operations'), 2)

    def test_concurrent_addendum_retry_does_not_duplicate(self):
        final = self.final()
        key = uuid4()
        results = self.race([lambda:self.call('addendum', final.id, key=key, version=2, text='Addition', reason='Reason')]*2)
        self.assertEqual(results[0], results[1])
        self.assertNotEqual(results[0], 'conflict')
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_addenda'), 1)
        self.assertEqual(self.scalar('SELECT version FROM clinical_records'), 3)

    def test_changed_request_or_stale_version_does_not_write(self):
        key = uuid4()
        record = self.call(key=key, text='Original')
        with self.assertRaises(ConflictError):
            self.call(key=key, text='Changed')
        with self.assertRaises(ConflictError):
            self.call('save', record.id, version=2, text='Changed')
        self.assertEqual(self.scalar('SELECT text FROM clinical_records'), 'Original')
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_operations'), 1)

    def test_commit_failure_rolls_back_record_and_receipt(self):
        with Session(self.engine) as db, patch.object(db, 'commit', side_effect=RuntimeError('Fictitious commit failure')):
            with self.assertRaises(RuntimeError):
                SqlAlchemyClinicalRecordRepository(db).execute('create', self.visit, actor_id=self.actor,
                    session_id=self.session_id, key=uuid4(), text='Original')
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_records'), 0)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_operations'), 0)

    def test_commit_failure_rolls_back_addendum_version_and_receipt(self):
        record = self.final()
        with Session(self.engine) as db, patch.object(db, 'commit', side_effect=RuntimeError('Fictitious commit failure')):
            with self.assertRaises(RuntimeError):
                SqlAlchemyClinicalRecordRepository(db).execute('addendum', record.id, actor_id=self.actor,
                    session_id=self.session_id, key=uuid4(), version=2, text='Addition', reason='Reason')
        self.assertEqual(self.scalar('SELECT version FROM clinical_records'), 2)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_addenda'), 0)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_operations'), 2)

    def test_revoked_permission_and_session_block_even_exact_replay(self):
        key = uuid4()
        self.call(key=key, text='Original')
        with self.engine.begin() as db:
            db.execute(text("UPDATE role_permissions SET permissions='{}',version=version+1 WHERE role='dentist'"))
        with self.assertRaises(ForbiddenError):
            self.call(key=key, text='Original')
        with self.engine.begin() as db:
            db.execute(text('DELETE FROM auth_sessions WHERE id=:id'), {'id': self.session_id})
        with self.assertRaises(UnauthorizedError):
            self.call(key=key, text='Original')
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_operations'), 1)

    def test_admin_read_requires_explicit_grant_and_never_grants_authorship(self):
        record = self.final()
        admin_id, admin_session = uuid4(), uuid4()
        with Session(self.engine) as db:
            db.add(UserModel(id=admin_id, name='Fictitious Reader', email='reader@example.com',
                             role=UserRole.admin, password_hash='fictitious'))
            db.flush()
            db.add(AuthSessionModel(id=admin_session, user_id=admin_id,
                                    expires_at=datetime.now(timezone.utc)+timedelta(hours=1)))
            db.commit()
        with Session(self.engine) as db, self.assertRaises(ForbiddenError):
            SqlAlchemyClinicalRecordRepository(db).get(record.id, actor_id=admin_id, session_id=admin_session)
        with Session(self.engine) as db:
            permission = db.get(RolePermissionModel, UserRole.admin)
            if permission is None:
                permission = RolePermissionModel(role=UserRole.admin, permissions={})
                db.add(permission)
            else:
                permission.version += 1
            permission.permissions = {'clinical_records': {'view': True, 'create': True, 'update': True}}
            db.commit()
        with Session(self.engine) as db:
            self.assertEqual(SqlAlchemyClinicalRecordRepository(db).get(record.id, actor_id=admin_id,
                                                                        session_id=admin_session),record)
        with Session(self.engine) as db, self.assertRaises(ForbiddenError):
            SqlAlchemyClinicalRecordRepository(db).execute('addendum',record.id,actor_id=admin_id,
                session_id=admin_session,key=uuid4(),version=2,text='Addition',reason='Reason')

    def test_expired_or_foreign_session_cannot_read_existing_record(self):
        record = self.final()
        with Session(self.engine) as db, self.assertRaises(UnauthorizedError):
            SqlAlchemyClinicalRecordRepository(db).get(record.id,actor_id=self.actor,session_id=uuid4())
        with self.engine.begin() as db:
            db.execute(text("UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=:id"),
                       {'id':self.session_id})
        with Session(self.engine) as db, self.assertRaises(UnauthorizedError):
            SqlAlchemyClinicalRecordRepository(db).get(record.id,actor_id=self.actor,session_id=self.session_id)

    def test_sql_cannot_rewrite_final_content_or_remove_history(self):
        final = self.final()
        self.call('addendum', final.id, version=2, text='Addition', reason='Reason')
        for statement in (
            "UPDATE clinical_records SET text='Changed',version=version+1",
            'UPDATE clinical_records SET finalized_at=NULL,context=NULL,version=version+1',
            "UPDATE clinical_records SET context='{}',version=version+1",
            'DELETE FROM clinical_records', 'DELETE FROM clinical_addenda', 'DELETE FROM clinical_operations',
            "UPDATE clinical_addenda SET text='Changed'", "UPDATE clinical_operations SET result='{}'",
        ):
            with self.subTest(statement=statement), self.assertRaises(IntegrityError):
                with self.engine.begin() as db:
                    db.execute(text(statement))
        self.assertEqual(self.scalar('SELECT text FROM clinical_records'), final.text)

    def test_clinical_links_block_parent_deletion_and_visit_reassignment(self):
        self.call(text='Original')
        for table, identity in (('appointments',self.visit), ('patients',self.fixture.patients[0]),
                                ('dentists',self.fixture.dentists[0]), ('users',self.actor)):
            with self.subTest(table=table), self.assertRaises(IntegrityError):
                with self.engine.begin() as db:
                    db.execute(text(f'DELETE FROM {table} WHERE id=:id'), {'id':identity})
        for field, value in (('patient_id',self.fixture.patients[1]), ('dentist_id',self.fixture.dentists[1])):
            with self.subTest(field=field), self.assertRaises(IntegrityError):
                with self.engine.begin() as db:
                    db.execute(text(f'UPDATE appointments SET {field}=:value,version=version+1 WHERE id=:id'),
                               {'value':value,'id':self.visit})

    def test_migration_preserves_existing_data_and_refuses_destructive_downgrade(self):
        self.assertEqual(self.fixture.migrate('downgrade','0025_patient_creation_operations').returncode,0)
        def snapshot():
            return [self.scalar(f'SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM {table} t')
                    for table in ('patients','dentists','appointments','users','auth_sessions')]
        before = snapshot()
        self.assertEqual(self.fixture.migrate('upgrade','head').returncode,0)
        self.assertEqual(snapshot(),before)
        self.call(text='Original')
        self.assertNotEqual(self.fixture.migrate('downgrade','0025_patient_creation_operations').returncode,0)
        self.assertEqual(self.scalar('SELECT count(*) FROM clinical_records'),1)
