"""Administrative metadata and atomicity in migrated, disposable PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import threading
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import test_permission_authorization as fixtures
from src.adapters.db.repositories import administrative_audit as audit
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ConflictError, ForbiddenError
from src.core.permissions import get_default_permissions
from src.core.use_cases.user_use_cases import UserUseCases


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class AdministrativeAuditTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.PermissionAuthorizationTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.target, self.target_session = self.fixture.seed(UserRole.reception)
        self.identity = dict(actor_id=self.fixture.admin.id, session_id=self.fixture.session_id)

    def uc(self, db):
        users, permissions, _ = self.fixture.cases(db)
        return UserUseCases(users, fixtures.FakeAuth(), permissions)

    def events(self):
        with self.engine.connect() as db:
            return [dict(r) for r in db.execute(text('SELECT * FROM administrative_audit ORDER BY occurred_at,id')).mappings()]

    def fingerprint(self):
        with self.engine.connect() as db:
            raw = tuple(tuple(db.scalars(text(f'SELECT to_jsonb(t)::text FROM {table} t ORDER BY to_jsonb(t)::text')))
                        for table in ('users', 'auth_sessions', 'role_permissions', 'administrative_audit'))
        return hashlib.sha256(repr(raw).encode()).hexdigest()

    def write(self, db, action):
        if action == 'create':
            return self.uc(db).create(dict(name='Fictitious Private Name', email=uuid4().hex+'@example.com',
                                          password='fictitious-password', role=UserRole.reception), **self.identity)
        if action == 'update':
            return self.uc(db).update(self.target.id, dict(name='Fictitious Private Name', is_active=False, version=1), **self.identity)
        if action == 'password':
            return self.uc(db).set_password(self.target.id, 'fictitious-password', version=1, **self.identity)
        if action == 'delete':
            return self.uc(db).delete(self.target.id, version=1, **self.identity)
        _, _, permissions = self.fixture.cases(db)
        version, matrix = permissions.get_versioned(UserRole.reception)
        matrix['patients']['delete'] = not matrix['patients']['delete']
        return permissions.update_for_role(UserRole.reception, matrix, version=version, **self.identity)

    def test_creation_update_reset_delete_metadata_and_no_personal_values(self):
        with Session(self.engine) as db:
            created = self.write(db, 'create')
            saved = self.uc(db).update(created.id, {'name': 'Fictitious Changed', 'is_active': False, 'version': 1}, **self.identity)
            reset = self.uc(db).set_password(saved.id, 'fictitious-password', version=2, **self.identity)
            self.uc(db).delete(reset.id, version=3, **self.identity)
        events = self.events()
        self.assertEqual([e['action'] for e in events], ['user.created','user.updated','user.password_reset','user.deleted'])
        self.assertEqual([(e['before_version'], e['after_version']) for e in events], [(None,1),(1,2),(2,3),(3,None)])
        self.assertTrue(all(e['actor_id'] == self.fixture.admin.id and e['target_user_id'] == created.id for e in events))
        self.assertEqual(events[1]['changed_fields'], ['name','is_active'])
        self.assertEqual(events[2]['changed_fields'], [])
        encoded = json.dumps(events, default=str)
        self.assertTrue(all(value not in encoded for value in ('Fictitious', '@example.com', 'fictitious-password', 'fictitious-hash', 'password_hash')),
                        'Audit contains forbidden personal values or credentials')

    def test_permission_diff_is_effective_grants_not_raw_input(self):
        with Session(self.engine) as db:
            _, _, permissions = self.fixture.cases(db)
            version, before = permissions.get_versioned(UserRole.reception)
            matrix = get_default_permissions(UserRole.reception)
            matrix['patients']['delete'] = not before['patients']['delete']
            saved = permissions.update_for_role(UserRole.reception, matrix, version=version, **self.identity)
            permissions.update_for_role(UserRole.reception, matrix, version=saved.version, **self.identity)
        first, noop = self.events()
        self.assertEqual(first['permission_changes'], [dict(resource='patients', action='delete', before=before['patients']['delete'], after=not before['patients']['delete'])])
        self.assertEqual(first['target_role'], 'reception')
        self.assertEqual(first['before_version'], version)
        self.assertEqual(noop['permission_changes'], [])
        self.assertEqual(noop['after_version'], saved.version + 1)

    def test_failure_after_audit_insert_rolls_back_mutation_sessions_and_event(self):
        original = audit._append
        def fail_after_insert(*args, **kwargs):
            original(*args, **kwargs)
            raise RuntimeError('Fictitious failure after audit insertion')
        for action in ('create', 'update', 'password', 'delete', 'permissions'):
            with self.subTest(action=action):
                before = self.fingerprint()
                with Session(self.engine) as db, patch.object(audit, '_append', fail_after_insert), self.assertRaises(RuntimeError):
                    self.write(db, action)
                self.assertEqual(self.fingerprint(), before)

    def test_denial_and_stale_version_do_not_record_success(self):
        before = self.fingerprint()
        with Session(self.engine) as db, self.assertRaises(ForbiddenError):
            self.uc(db).update(self.target.id, {'version': 1, 'name': 'Fictitious'}, actor_id=self.target.id, session_id=self.target_session)
        with Session(self.engine) as db, self.assertRaises(ConflictError):
            self.uc(db).update(self.target.id, {'version': 99, 'name': 'Fictitious'}, **self.identity)
        self.assertEqual(self.fingerprint(), before)

    def test_concurrent_updates_have_one_event_for_the_winner(self):
        barrier = threading.Barrier(2, timeout=10)
        def writer(_):
            with Session(self.engine) as db:
                barrier.wait()
                try:
                    self.write(db, 'update')
                    return 'accepted'
                except ConflictError:
                    return 'conflict'
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(writer, range(2))), ['accepted','conflict'])
        self.assertEqual(len(self.events()), 1)

    def test_events_survive_actor_and_target_deletion_and_refuse_rewrite(self):
        with Session(self.engine) as db:
            self.write(db, 'update')
            self.uc(db).delete(self.target.id, version=2, **self.identity)
            self.uc(db).delete(self.fixture.admin.id, version=1, actor_id=self.fixture.backup.id,
                               session_id=self.fixture.backup_session_id)
        before = self.fingerprint()
        for statement in ('UPDATE administrative_audit SET action=action', 'DELETE FROM administrative_audit', 'TRUNCATE administrative_audit'):
            with self.engine.begin() as db, self.assertRaises(IntegrityError):
                db.execute(text(statement))
        self.assertEqual(self.fingerprint(), before)
        self.assertEqual(len(self.events()), 3)
        self.assertTrue(all(e['actor_id'] == self.fixture.admin.id for e in self.events()[:2]))

    def test_migration_preserves_existing_rows_without_fabricating_events(self):
        migrate = self.fixture.fixture.migrate
        before = self.fingerprint()
        self.assertEqual(migrate('downgrade', '0026_clinical_records').returncode, 0)
        self.assertEqual(migrate('upgrade', 'head').returncode, 0)
        self.assertEqual(self.fingerprint(), before)
        self.assertEqual(self.events(), [])
        with Session(self.engine) as db: self.write(db, 'update')
        preserved = self.fingerprint()
        self.assertNotEqual(migrate('downgrade', '0026_clinical_records').returncode, 0)
        self.assertEqual(self.fingerprint(), preserved)
