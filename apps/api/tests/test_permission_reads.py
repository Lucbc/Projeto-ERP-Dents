"""Permission reads must never persist defaults or undo a concurrent revocation."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import os
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

import test_appointment_concurrency as fixture
from src.adapters.db.repositories.role_permission_repository import SqlAlchemyRolePermissionRepository
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.api.deps.auth import require_permission
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ValidationError
from src.core.permissions import get_default_permissions, normalize_permissions
from src.core.use_cases.permission_use_cases import PermissionUseCases


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PermissionReadTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        # Migrations seed matrices; missing-row cases deliberately remove only
        # these fictitious rows in this test's private schema.
        with self.engine.begin() as db:
            db.execute(text('DELETE FROM role_permissions'))
        self.actor = SimpleNamespace(role=UserRole.reception)

    def seed(self, raw):
        with Session(self.engine) as db:
            SqlAlchemyRolePermissionRepository(db).upsert(UserRole.reception, raw)

    def stored(self):
        with self.engine.connect() as db:
            return db.execute(text('SELECT role, permissions::text, updated_at FROM role_permissions ORDER BY role')).all()

    def writable_case(self, db):
        users = SqlAlchemyUserRepository(db)
        actor = users.create({'name': 'Fictitious Admin', 'email': 'permission-admin@example.com',
                              'role': UserRole.admin, 'password_hash': 'test-only'})
        session_id = uuid4()
        users.create_session(session_id, actor.id, datetime.now(timezone.utc) + timedelta(hours=1))
        return PermissionUseCases(SqlAlchemyRolePermissionRepository(db), users), dict(actor_id=actor.id, session_id=session_id)

    def test_missing_partial_and_canonical_reads_in_read_only_transaction(self):
        for raw in (None, {'patients': {'view': True, 'create': False}, 'legacy': {'keep': True}},
                    get_default_permissions(UserRole.reception)):
            with self.subTest(raw=raw):
                if raw is not None:
                    self.seed(raw)
                before = self.stored()
                with Session(self.engine) as db:
                    db.execute(text('SET TRANSACTION READ ONLY'))
                    with patch.object(db, 'commit', side_effect=AssertionError('Read must not commit')):
                        uc = PermissionUseCases(SqlAlchemyRolePermissionRepository(db))
                        expected = normalize_permissions(UserRole.reception, raw)
                        self.assertEqual(uc.get_for_role(UserRole.reception), expected)
                        self.assertEqual(uc.list_all()[UserRole.reception], expected)
                        self.assertIs(require_permission('patients', 'view')(self.actor, db), self.actor)
                        with self.assertRaises(HTTPException) as denied:
                            require_permission('users', 'delete')(self.actor, db)
                        self.assertEqual(denied.exception.status_code, 403)
                self.assertEqual(self.stored(), before)

    def test_reads_do_not_commit_unrelated_pending_work(self):
        with Session(self.engine) as db:
            original = db.scalar(text('SELECT full_name FROM patients LIMIT 1'))
            db.execute(text("UPDATE patients SET full_name = 'Fictitious pending change'"))
            PermissionUseCases(SqlAlchemyRolePermissionRepository(db)).list_all()
            require_permission('patients', 'view')(self.actor, db)
            db.rollback()
        with Session(self.engine) as db:
            self.assertEqual(db.scalar(text('SELECT full_name FROM patients LIMIT 1')), original)
        self.assertEqual(self.stored(), [])

    def test_simultaneous_missing_reads_never_create_rows(self):
        barrier = threading.Barrier(2, timeout=10)
        original = SqlAlchemyRolePermissionRepository.get_by_role

        def read(repo, role):
            result = original(repo, role)
            self.assertIsNone(result)
            barrier.wait()
            return result

        def worker(gate):
            with Session(self.engine) as db:
                if gate:
                    return require_permission('patients', 'view')(self.actor, db).role
                return PermissionUseCases(SqlAlchemyRolePermissionRepository(db)).get_for_role(UserRole.reception)

        with patch.object(SqlAlchemyRolePermissionRepository, 'get_by_role', read):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(worker, (False, True)))
        self.assertEqual(results, [get_default_permissions(UserRole.reception), UserRole.reception])
        self.assertEqual(self.stored(), [])

    def test_revocation_after_read_is_not_overwritten_and_next_call_denies(self):
        for gate in (False, True):
            with self.subTest(gate=gate):
                self.seed({'patients': {'view': True}})
                revoked = {'patients': {'view': False}, 'legacy': {'keep': True}}
                original = SqlAlchemyRolePermissionRepository.get_by_role

                def read_then_revoke(repo, role):
                    snapshot = original(repo, role)
                    self.seed(revoked)  # Independent connection commits after the old read.
                    return snapshot

                with Session(self.engine) as db:
                    with patch.object(SqlAlchemyRolePermissionRepository, 'get_by_role', read_then_revoke):
                        if gate:
                            self.assertIs(require_permission('patients', 'view')(self.actor, db), self.actor)
                        else:
                            self.assertTrue(PermissionUseCases(SqlAlchemyRolePermissionRepository(db))
                                            .get_for_role(UserRole.reception)['patients']['view'])
                with Session(self.engine) as db:
                    repo = SqlAlchemyRolePermissionRepository(db)
                    self.assertEqual(repo.get_by_role(UserRole.reception).permissions, revoked)
                    self.assertFalse(PermissionUseCases(repo).get_for_role(UserRole.reception)['patients']['view'])
                    with self.assertRaises(HTTPException) as denied:
                        require_permission('patients', 'view')(self.actor, db)
                    self.assertEqual(denied.exception.status_code, 403)

    def test_explicit_update_still_persists_and_returned_matrix_is_independent(self):
        raw = {'patients': {'view': False}}
        untouched = deepcopy(raw)
        with Session(self.engine) as db:
            uc, actor = self.writable_case(db)
            expected = normalize_permissions(UserRole.reception, raw)
            self.assertEqual(uc.update_for_role(UserRole.reception, raw, **actor), expected)
            result = uc.get_for_role(UserRole.reception)
            result['patients']['view'] = True
            self.assertEqual(uc.get_for_role(UserRole.reception), expected)
        self.assertEqual(raw, untouched)
        with Session(self.engine) as db:
            self.assertEqual(SqlAlchemyRolePermissionRepository(db).get_by_role(UserRole.reception).permissions, expected)

    def test_admin_defaults_and_immutability_are_preserved(self):
        with Session(self.engine) as db:
            uc, identity = self.writable_case(db)
            self.assertEqual(uc.get_for_role(UserRole.admin), get_default_permissions(UserRole.admin))
            actor = SimpleNamespace(role=UserRole.admin)
            self.assertIs(require_permission('users', 'delete')(actor, db), actor)
            with self.assertRaises(ValidationError):
                uc.update_for_role(UserRole.admin, {}, **identity)
        self.assertEqual(self.stored(), [])
