from user_version_fixtures import delete_fixture, own_password_fixture, password_fixture, update_fixture
"""Session reauthorization under real administrative locks in private schemas."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
import threading
import unittest
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

import test_permission_authorization as fixtures
from src.adapters.db.models.models import UserModel
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import UnauthorizedError
from src.core.use_cases.auth_use_cases import AuthUseCases
from src.core.use_cases.user_use_cases import UserUseCases


class FakeAuth(fixtures.FakeAuth):
    def verify_password(self, plain, hashed):
        return plain == 'fictitious-original' and hashed == 'fictitious-original'


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class UserSessionAuthorizationTests(unittest.TestCase):
    operations = ('create', 'update', 'password', 'delete', 'own_password')

    def setUp(self):
        self.fixture = fixtures.PermissionAuthorizationTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine

    def seed(self):
        actor, sid = self.fixture.seed(UserRole.admin)
        target, _ = self.fixture.seed(UserRole.reception)
        return actor, sid, target

    def run_operation(self, db, operation, actor, sid, target):
        users, permissions, _ = self.fixture.cases(db)
        uc = UserUseCases(users, FakeAuth(), permissions)
        identity = dict(actor_id=actor.id, session_id=sid)
        if operation == 'create':
            return uc.create({'name': 'Fictitious Created', 'email': uuid4().hex + '@example.com',
                              'password': 'fictitious-new', 'role': 'reception'}, **identity)
        if operation == 'update': return update_fixture(uc, target.id, {'name': 'Fictitious Updated'}, **identity)
        if operation == 'password': return password_fixture(uc, target.id, 'fictitious-new', **identity)
        if operation == 'delete': return delete_fixture(uc, target.id, **identity)
        return own_password_fixture(AuthUseCases(users, FakeAuth()), actor.id, 'fictitious-original',
                                                              'fictitious-new', session_id=sid)

    def snapshot(self):
        with self.engine.connect() as db:
            return tuple(tuple(db.scalars(text(f'SELECT to_jsonb(t)::text FROM {table} t ORDER BY to_jsonb(t)::text')))
                         for table in ('users', 'auth_sessions'))

    def test_revocation_first_denies_all_operations_after_lock_wait(self):
        for operation in self.operations:
            for revocation in ('logout', 'disable', 'demote', 'password', 'delete'):
                with self.subTest(operation=operation, revocation=revocation):
                    actor, sid, target = self.seed()
                    ready, pid = threading.Event(), []
                    def pending():
                        with Session(self.engine, expire_on_commit=False) as db:
                            self.assertTrue(db.get(UserModel, actor.id).is_active)
                            self.assertTrue(self.fixture.cases(db)[0].session_active(sid, actor.id))
                            pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                            ready.set()
                            with self.assertRaises(UnauthorizedError):
                                self.run_operation(db, operation, actor, sid, target)
                    with ThreadPoolExecutor(max_workers=1) as pool:
                        with Session(self.engine) as db, self.fixture.cases(db)[0].administration_lock():
                            future = pool.submit(pending)
                            self.assertTrue(ready.wait(8))
                            self.fixture.wait_blocked(pid[0])
                            self.fixture.revoke(db, revocation, actor, sid)
                        future.result(timeout=10)
                    with Session(self.engine) as observer:
                        users = self.fixture.cases(observer)[0]
                        self.assertEqual(users.get(target.id), target)
                        self.assertFalse(users.session_active(sid, actor.id))

    def test_write_first_commits_before_waiting_logout(self):
        for operation in self.operations:
            with self.subTest(operation=operation):
                actor, sid, target = self.seed()
                ready, release, waiting, pid = threading.Event(), threading.Event(), threading.Event(), []
                method = 'create' if operation == 'create' else 'delete' if operation == 'delete' else 'update'
                repo_class = SqlAlchemyUserRepository
                original = getattr(repo_class, method)
                def hook(repo, *args, **kwargs):
                    ready.set()
                    self.assertTrue(release.wait(10))
                    return original(repo, *args, **kwargs)
                def write():
                    with Session(self.engine) as db:
                        return self.run_operation(db, operation, actor, sid, target)
                def logout():
                    with Session(self.engine) as db:
                        pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                        waiting.set()
                        self.fixture.cases(db)[0].revoke_session(sid, actor.id)
                with patch.object(repo_class, method, hook), ThreadPoolExecutor(max_workers=2) as pool:
                    first = pool.submit(write)
                    try:
                        self.assertTrue(ready.wait(8))
                        second = pool.submit(logout)
                        self.assertTrue(waiting.wait(8))
                        self.fixture.wait_blocked(pid[0])
                    finally:
                        release.set()
                    result = first.result(timeout=10)
                    second.result(timeout=10)
                with Session(self.engine) as db:
                    users = self.fixture.cases(db)[0]
                    self.assertFalse(users.session_active(sid, actor.id))
                    if operation == 'create': self.assertEqual(users.get(result.id).name, 'Fictitious Created')
                    elif operation == 'delete': self.assertIsNone(users.get(target.id))
                    elif operation == 'update': self.assertEqual(users.get(target.id).name, 'Fictitious Updated')
                    else:
                        self.assertEqual(users.get(actor.id if operation == 'own_password' else target.id).password_hash,
                                         'fictitious-hash')

    def test_foreign_expired_and_missing_session_preserve_rows(self):
        actor, sid, target = self.seed()
        foreign = self.fixture.session_id
        with self.engine.begin() as db:
            db.execute(text("UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=:id"), {'id': sid})
        before = self.snapshot()
        for invalid in (sid, foreign, uuid4()):
            for operation in self.operations:
                with self.subTest(operation=operation), Session(self.engine) as db, self.assertRaises(UnauthorizedError):
                    self.run_operation(db, operation, actor, invalid, target)
        self.assertEqual(self.snapshot(), before)

    def test_expiration_during_wait_uses_current_database_clock(self):
        actor, sid, target = self.seed()
        # Set a future expiry before the request transaction starts.
        with self.engine.begin() as db:
            db.execute(text("UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=:id"), {'id': sid})
        ready, pid = threading.Event(), []
        def pending():
            with Session(self.engine) as db:
                self.assertTrue(self.fixture.cases(db)[0].session_active(sid, actor.id))
                pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                ready.set()
                with self.assertRaises(UnauthorizedError): self.run_operation(db, 'update', actor, sid, target)
        with ThreadPoolExecutor(max_workers=1) as pool:
            with Session(self.engine) as db, self.fixture.cases(db)[0].administration_lock():
                future = pool.submit(pending)
                self.assertTrue(ready.wait(8))
                self.fixture.wait_blocked(pid[0])
                db.execute(text('SELECT pg_sleep(2.1)'))
            future.result(timeout=10)

    def test_compatible_rename_preserves_pending_operation(self):
        for operation in self.operations:
            actor, sid, target = self.seed()
            with Session(self.engine, expire_on_commit=False) as db:
                db.get(UserModel, actor.id)
                with Session(self.engine) as other:
                    self.fixture.revoke(other, 'rename', actor, sid)
                self.run_operation(db, operation, actor, sid, target)

    def test_commit_failure_rolls_back_each_operation_and_sessions(self):
        for operation in self.operations:
            actor, sid, target = self.seed()
            before = self.snapshot()
            with Session(self.engine) as db:
                with patch.object(db, 'commit', side_effect=RuntimeError('Fictitious failure')):
                    with self.assertRaises(RuntimeError): self.run_operation(db, operation, actor, sid, target)
            self.assertEqual(self.snapshot(), before)

    def test_own_password_denies_inactive_account_even_with_session_row(self):
        actor, sid, target = self.seed()
        with self.engine.begin() as db:
            db.execute(text('UPDATE users SET is_active=false WHERE id=:id'), {'id': actor.id})
        before = self.snapshot()
        with Session(self.engine) as db, self.assertRaises(UnauthorizedError):
            self.run_operation(db, 'own_password', actor, sid, target)
        self.assertEqual(self.snapshot(), before)

    def test_other_live_session_can_write_after_logout(self):
        actor, sid, target = self.seed()
        fresh = uuid4()
        with Session(self.engine) as db:
            users = self.fixture.cases(db)[0]
            users.create_session(fresh, actor.id, datetime.now(timezone.utc) + timedelta(hours=1))
            users.revoke_session(sid, actor.id)
            self.run_operation(db, 'update', actor, fresh, target)
