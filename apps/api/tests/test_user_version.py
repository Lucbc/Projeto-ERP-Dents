"""Captured user versions: stale writes must never become fresh fixture writes."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import os
import threading
import unittest
from unittest.mock import patch

from pydantic import ValidationError as SchemaError
from sqlalchemy import text
from sqlalchemy.orm import Session

import test_permission_authorization as fixtures
from test_user_session_authorization import FakeAuth
from src.api.schemas.schemas import UserUpdateRequest, SetPasswordRequest, ChangePasswordRequest
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ConflictError, NotFoundError, UnauthorizedError
from src.core.use_cases.user_use_cases import UserUseCases
from src.core.use_cases.auth_use_cases import AuthUseCases


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class UserVersionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.PermissionAuthorizationTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.target, self.target_session = self.fixture.seed(UserRole.reception)

    def uc(self, db):
        users, permissions, _ = self.fixture.cases(db)
        return UserUseCases(users, FakeAuth(), permissions)

    def write(self, db, action, version, target=None):
        target = target or self.target
        identity = dict(actor_id=self.fixture.admin.id, session_id=self.fixture.session_id)
        if action == 'edit': return self.uc(db).update(target.id, {'name': 'Fictitious Updated', 'version': version}, **identity)
        if action == 'delete': return self.uc(db).delete(target.id, version=version, **identity)
        return self.uc(db).set_password(target.id, 'fictitious-new', version=version, **identity)

    def fingerprint(self):
        with self.engine.connect() as db:
            raw = '|'.join(str(db.scalars(text(f'SELECT to_jsonb(t)::text FROM {table} t ORDER BY to_jsonb(t)::text')).all())
                           for table in ('users', 'auth_sessions'))
        return hashlib.sha256(raw.encode()).hexdigest()

    def test_strict_payload_versions(self):
        for schema, payload in ((UserUpdateRequest, {}), (SetPasswordRequest, {'new_password': 'fictitious-new'}),
                                (ChangePasswordRequest, {'current_password': 'fictitious-original', 'new_password': 'fictitious-new'})):
            with self.assertRaises(SchemaError): schema(**payload)
            for invalid in (0, -1, None, True, '1', 1.5, 2**63 - 1):
                with self.assertRaises(SchemaError): schema(**payload, version=invalid)
            self.assertEqual(schema(**payload, version=1).version, 1)

    def test_stale_edits_passwords_and_deletions_preserve_rows_and_sessions(self):
        with Session(self.engine) as db:
            saved = self.write(db, 'edit', 1)
            self.assertEqual(saved.version, 2)
        before = self.fingerprint()
        for action in ('edit', 'password', 'delete'):
            with Session(self.engine) as db, self.assertRaises(ConflictError) as error:
                self.write(db, action, 1)
            self.assertEqual(error.exception.code, 'stale_version')
            self.assertEqual(self.fingerprint(), before)

    def test_accepted_noop_consumes_version_without_revoking_session(self):
        with Session(self.engine) as db:
            self.write(db, 'edit', 1)
            self.assertEqual(self.write(db, 'edit', 2).version, 3)
            users = self.fixture.cases(db)[0]
            self.assertTrue(users.session_active(self.target_session, self.target.id))
            self.assertEqual(users.get(self.target.id).version, 3)

    def test_two_writers_have_one_winner_for_each_pair(self):
        for actions in (('edit', 'edit'), ('edit', 'password'), ('password', 'delete'), ('edit', 'delete'), ('delete', 'delete')):
            with self.subTest(actions=actions):
                target, _ = self.fixture.seed(UserRole.reception)
                barrier = threading.Barrier(2, timeout=10)
                def worker(action):
                    with Session(self.engine) as db:
                        barrier.wait()
                        try: self.write(db, action, 1, target); return 'accepted'
                        except (ConflictError, NotFoundError): return 'rejected'
                with ThreadPoolExecutor(max_workers=2) as pool:
                    self.assertEqual(sorted(pool.map(worker, actions)), ['accepted', 'rejected'])

    def test_own_password_and_admin_reset_have_one_winner(self):
        barrier = threading.Barrier(2, timeout=10)
        def worker(own):
            with Session(self.engine) as db:
                barrier.wait()
                try:
                    if own:
                        AuthUseCases(self.fixture.cases(db)[0], FakeAuth()).change_password(self.target.id,
                            'fictitious-original', 'fictitious-new', version=1, session_id=self.target_session)
                    else: self.write(db, 'password', 1)
                    return 'accepted'
                except (ConflictError, UnauthorizedError): return 'rejected'
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(worker, (True, False))), ['accepted', 'rejected'])
        with Session(self.engine) as db:
            users = self.fixture.cases(db)[0]
            self.assertEqual(users.get(self.target.id).version, 2)
            self.assertFalse(users.session_active(self.target_session, self.target.id))

    def test_stale_own_password_preserves_credentials_and_session(self):
        with Session(self.engine) as db: self.write(db, 'edit', 1)
        before = self.fingerprint()
        with Session(self.engine) as db, self.assertRaises(ConflictError):
            AuthUseCases(self.fixture.cases(db)[0], FakeAuth()).change_password(self.target.id,
                'fictitious-original', 'fictitious-new', version=1, session_id=self.target_session)
        self.assertEqual(self.fingerprint(), before)

    def test_commit_failures_do_not_consume_version_or_revoke(self):
        for action in ('edit', 'password', 'delete'):
            before = self.fingerprint()
            with Session(self.engine) as db:
                with patch.object(db, 'commit', side_effect=RuntimeError('Fictitious failure')):
                    with self.assertRaises(RuntimeError): self.write(db, action, 1)
            self.assertEqual(self.fingerprint(), before)

    def test_revocation_precedes_target_version_conflict(self):
        with Session(self.engine) as db:
            self.fixture.cases(db)[0].revoke_session(self.fixture.session_id, self.fixture.admin.id)
            for action in ('edit', 'password', 'delete'):
                with self.assertRaises(UnauthorizedError): self.write(db, action, 100)

    def test_old_orm_cannot_overwrite_or_delete(self):
        with Session(self.engine, expire_on_commit=False) as db:
            users = self.fixture.cases(db)[0]
            self.assertEqual(users.get(self.target.id).version, 1)
            with Session(self.engine) as other: self.write(other, 'edit', 1)
            with self.assertRaises(ConflictError): users.update(self.target.id, {'name': 'Fictitious Old'}, 1)
            with self.assertRaises(ConflictError): users.delete(self.target.id, 1)
            self.assertEqual(users.get(self.target.id).version, 2)

    def test_migration_preserves_users_sessions_and_installation_state(self):
        migrate = self.fixture.fixture.migrate
        self.assertEqual(migrate('downgrade', '0023_permission_version').returncode, 0)
        def snapshot():
            with self.engine.connect() as db:
                data = tuple(tuple(db.scalars(text(f"SELECT (to_jsonb(t)-'version')::text FROM {table} t ORDER BY (to_jsonb(t)-'version')::text")))
                             for table in ('users', 'auth_sessions', 'installation_state'))
            return hashlib.sha256(repr(data).encode()).hexdigest()
        before = snapshot()
        self.assertEqual(migrate('upgrade', 'head').returncode, 0)
        self.assertEqual(snapshot(), before)
        with self.engine.connect() as db:
            self.assertEqual(set(db.scalars(text('SELECT version FROM users'))), {1})
        self.assertEqual(migrate('downgrade', '0023_permission_version').returncode, 0)
        self.assertEqual(snapshot(), before)
        self.assertEqual(migrate('upgrade', 'head').returncode, 0)
