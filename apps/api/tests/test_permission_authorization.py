"""Administrative serialization on migrated, disposable PostgreSQL schemas."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
import os
import threading
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

import test_appointment_concurrency as fixture
from src.adapters.db.models.models import RolePermissionModel, UserModel
from src.adapters.db.repositories.role_permission_repository import SqlAlchemyRolePermissionRepository
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ForbiddenError, UnauthorizedError, ValidationError
from src.core.permissions import get_default_permissions
from src.core.use_cases.permission_use_cases import PermissionUseCases
from src.core.use_cases.user_use_cases import UserUseCases


class FakeAuth:
    def hash_password(self, value):
        return 'fictitious-hash'


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PermissionAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.admin, self.session_id = self.seed(UserRole.admin)
        self.backup, _ = self.seed(UserRole.admin)

    def seed(self, role):
        with Session(self.engine) as db:
            repo = SqlAlchemyUserRepository(db)
            user = repo.create({'name': 'Fictitious Actor', 'email': uuid4().hex + '@example.com',
                               'role': role, 'password_hash': 'fictitious-original'})
            sid = uuid4()
            repo.create_session(sid, user.id, datetime.now(timezone.utc) + timedelta(hours=1))
            return user, sid

    def cases(self, db):
        users, permissions = SqlAlchemyUserRepository(db), SqlAlchemyRolePermissionRepository(db)
        return users, permissions, PermissionUseCases(permissions, users)

    def matrix(self):
        with Session(self.engine) as db:
            return SqlAlchemyRolePermissionRepository(db).get_by_role(UserRole.reception).permissions

    def changed(self):
        matrix = get_default_permissions(UserRole.reception)
        matrix['patients']['view'] = False
        return matrix

    def wait_blocked(self, pid):
        deadline = time.monotonic() + 8
        with self.engine.connect() as observer:
            while time.monotonic() < deadline:
                if observer.scalar(text('SELECT cardinality(pg_blocking_pids(:pid))'), {'pid': pid}):
                    return
                time.sleep(.01)
        self.fail('Expected operation to wait on the administration lock')

    def revoke(self, db, operation, actor, sid):
        users, permissions, _ = self.cases(db)
        uc = UserUseCases(users, FakeAuth(), permissions)
        if operation == 'logout':
            users.revoke_session(sid, actor.id)
        elif operation == 'delete':
            uc.delete(actor.id, actor_id=self.backup.id)
        elif operation == 'password':
            uc.set_password(actor.id, 'fictitious-reset-password', actor_id=self.backup.id)
        elif operation == 'rename':
            uc.update(actor.id, {'name': 'Fictitious Renamed Admin'}, actor_id=self.backup.id)
        else:
            uc.update(actor.id, {'is_active': False} if operation == 'disable' else {'role': UserRole.reception},
                      actor_id=self.backup.id)

    def test_revocation_first_denies_waiting_write_with_cached_identity(self):
        for operation in ('disable', 'demote', 'delete', 'password', 'logout', 'rename'):
            with self.subTest(operation=operation):
                actor, sid = self.seed(UserRole.admin)
                before = self.matrix()
                ready, pid = threading.Event(), []

                def attempt():
                    with Session(self.engine, expire_on_commit=False) as db:
                        cached = db.get(UserModel, actor.id)
                        self.assertEqual(cached.role, UserRole.admin)
                        pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                        ready.set()
                        with self.assertRaises(UnauthorizedError) if operation != 'rename' else nullcontext():
                            self.cases(db)[2].update_for_role(UserRole.reception, self.changed(),
                                                             actor_id=actor.id, session_id=sid)

                with ThreadPoolExecutor(max_workers=1) as pool:
                    with Session(self.engine) as db:
                        with SqlAlchemyUserRepository(db).administration_lock():
                            future = pool.submit(attempt)
                            self.assertTrue(ready.wait(8))
                            self.wait_blocked(pid[0])
                            self.revoke(db, operation, actor, sid)
                    future.result(timeout=10)
                self.assertEqual(self.matrix(), self.changed() if operation == 'rename' else before)

    def test_permission_commit_first_then_revocation_preserves_committed_write(self):
        for operation in ('disable', 'demote', 'delete', 'password', 'logout'):
            with self.subTest(operation=operation):
                actor, sid = self.seed(UserRole.admin)
                ready, release, revoking, pid = threading.Event(), threading.Event(), threading.Event(), []

                def save():
                    with Session(self.engine) as db:
                        _, repo, uc = self.cases(db)
                        original = repo.upsert
                        def held(*args):
                            ready.set()
                            self.assertTrue(release.wait(10))
                            return original(*args)
                        with patch.object(repo, 'upsert', held):
                            return uc.update_for_role(UserRole.reception, self.changed(), actor_id=actor.id, session_id=sid)

                def revoke():
                    with Session(self.engine) as db:
                        pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                        revoking.set()
                        self.revoke(db, operation, actor, sid)

                with ThreadPoolExecutor(max_workers=2) as pool:
                    first = pool.submit(save)
                    try:
                        self.assertTrue(ready.wait(8))
                        second = pool.submit(revoke)
                        self.assertTrue(revoking.wait(8))
                        self.wait_blocked(pid[0])
                    finally:
                        release.set()
                    self.assertEqual(first.result(timeout=10), self.changed())
                    second.result(timeout=10)
                self.assertEqual(self.matrix(), self.changed())
                with Session(self.engine) as db:
                    self.assertFalse(SqlAlchemyUserRepository(db).session_active(sid, actor.id))

    def test_actor_is_reloaded_even_if_session_was_not_revoked(self):
        # Simulate legacy/external changes that leave a session behind.
        for column, value in (('is_active', 'false'), ('role', "'reception'")):
            with self.subTest(column=column):
                actor, sid = self.seed(UserRole.admin)
                before = self.matrix()
                ready, pid = threading.Event(), []
                def attempt():
                    with Session(self.engine, expire_on_commit=False) as db:
                        cached = db.get(UserModel, actor.id)
                        self.assertTrue(cached.is_active)
                        pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                        ready.set()
                        with self.assertRaises(ForbiddenError):
                            self.cases(db)[2].update_for_role(UserRole.reception, self.changed(),
                                                             actor_id=actor.id, session_id=sid)
                with ThreadPoolExecutor(max_workers=1) as pool:
                    with Session(self.engine) as db:
                        with SqlAlchemyUserRepository(db).administration_lock():
                            future = pool.submit(attempt)
                            self.assertTrue(ready.wait(8))
                            self.wait_blocked(pid[0])
                            db.execute(text(f'UPDATE users SET {column}={value} WHERE id=:id'), {'id': actor.id})
                            db.commit()
                    future.result(timeout=10)
                self.assertEqual(self.matrix(), before)

    def test_session_expiring_during_lock_wait_is_denied(self):
        ready, pid = threading.Event(), []
        def attempt():
            with Session(self.engine) as db:
                users, _, uc = self.cases(db)
                self.assertTrue(users.session_active(self.session_id, self.admin.id))
                pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                ready.set()
                with self.assertRaises(UnauthorizedError):
                    uc.update_for_role(UserRole.reception, self.changed(), actor_id=self.admin.id, session_id=self.session_id)
        with ThreadPoolExecutor(max_workers=1) as pool:
            with Session(self.engine) as db:
                with SqlAlchemyUserRepository(db).administration_lock():
                    future = pool.submit(attempt)
                    self.assertTrue(ready.wait(8))
                    self.wait_blocked(pid[0])
                    # Expiry lies after the waiting transaction's start but before release.
                    db.execute(text('UPDATE auth_sessions SET expires_at=clock_timestamp() WHERE id=:id'), {'id': self.session_id})
                    db.commit()
            future.result(timeout=10)

    def test_foreign_session_is_rejected_before_matrix_validation(self):
        _, foreign = self.seed(UserRole.admin)
        before = self.matrix()
        with Session(self.engine) as db:
            with self.assertRaises(UnauthorizedError):
                self.cases(db)[2].update_for_role(UserRole.admin, {'private-invalid': {}},
                                                 actor_id=self.admin.id, session_id=foreign)
        self.assertEqual(self.matrix(), before)

    def test_failed_write_rolls_back_and_releases_lock(self):
        before = self.matrix()
        with Session(self.engine) as db:
            _, repo, uc = self.cases(db)
            def failing(role, matrix):
                db.get(RolePermissionModel, role).permissions = matrix
                db.flush()
                raise RuntimeError('Fictitious failure after flush')
            with patch.object(repo, 'upsert', failing), self.assertRaises(RuntimeError):
                uc.update_for_role(UserRole.reception, self.changed(), actor_id=self.admin.id, session_id=self.session_id)
        self.assertEqual(self.matrix(), before)
        with Session(self.engine) as db:
            self.cases(db)[2].update_for_role(UserRole.reception, self.changed(), actor_id=self.admin.id, session_id=self.session_id)
        self.assertEqual(self.matrix(), self.changed())

    def test_permission_revocation_and_delegated_user_write_are_ordered(self):
        delegate, _ = self.seed(UserRole.coordinator)
        target, _ = self.seed(UserRole.reception)
        for revoke_first in (True, False):
            with self.subTest(revoke_first=revoke_first):
                allowed = get_default_permissions(UserRole.coordinator)
                allowed['users']['update'] = True
                denied = get_default_permissions(UserRole.coordinator)
                denied['users']['update'] = False
                with Session(self.engine) as db:
                    self.cases(db)[2].update_for_role(UserRole.coordinator, allowed, actor_id=self.admin.id, session_id=self.session_id)
                ready, release, waiting, pid = threading.Event(), threading.Event(), threading.Event(), []

                def operation(revoke, held):
                    with Session(self.engine) as db:
                        users, permissions, uc = self.cases(db)
                        user_uc = UserUseCases(users, FakeAuth(), permissions)
                        # Force an ORM identity read before lock wait.
                        cached = db.get(RolePermissionModel, UserRole.coordinator)
                        self.assertTrue(cached.permissions['users']['update'])
                        if not held:
                            pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                            waiting.set()
                        repo, method = (permissions, 'upsert') if revoke else (users, 'update')
                        original = getattr(repo, method)
                        def hook(*args):
                            ready.set()
                            self.assertTrue(release.wait(10))
                            return original(*args)
                        def run():
                            if revoke:
                                return uc.update_for_role(UserRole.coordinator, denied, actor_id=self.admin.id, session_id=self.session_id)
                            return user_uc.update(target.id, {'name': 'Fictitious Ordered Edit'}, actor_id=delegate.id)
                        if held:
                            with patch.object(repo, method, hook):
                                return run()
                        if revoke_first:
                            with self.assertRaises(ForbiddenError): run()
                        else:
                            return run()

                with ThreadPoolExecutor(max_workers=2) as pool:
                    first = pool.submit(operation, revoke_first, True)
                    try:
                        self.assertTrue(ready.wait(8))
                        second = pool.submit(operation, not revoke_first, False)
                        self.assertTrue(waiting.wait(8))
                        self.wait_blocked(pid[0])
                    finally:
                        release.set()
                    first.result(timeout=10)
                    second.result(timeout=10)
                with Session(self.engine) as db:
                    user = SqlAlchemyUserRepository(db).get(target.id)
                    self.assertEqual(user.name, 'Fictitious Actor' if revoke_first else 'Fictitious Ordered Edit')

    def test_invalid_matrix_and_admin_profile_preserve_state(self):
        before = self.matrix()
        for role, matrix in ((UserRole.admin, {}), (UserRole.reception, {'unknown': {}})):
            with Session(self.engine) as db, self.assertRaises(ValidationError):
                self.cases(db)[2].update_for_role(role, matrix, actor_id=self.admin.id, session_id=self.session_id)
        self.assertEqual(self.matrix(), before)
