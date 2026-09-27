"""CAS, defaults and migration for permission matrices in private homologation schemas."""
from concurrent.futures import ThreadPoolExecutor
import os
import threading
import unittest
from unittest.mock import patch

from pydantic import ValidationError as SchemaError
from sqlalchemy import text
from sqlalchemy.orm import Session

import test_permission_authorization as fixtures
from src.adapters.db.models.models import RolePermissionModel
from src.adapters.db.repositories.role_permission_repository import SqlAlchemyRolePermissionRepository
from src.api.schemas.schemas import RolePermissionUpdateRequest
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ConflictError, UnauthorizedError
from src.core.permissions import get_default_permissions


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PermissionVersionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.PermissionAuthorizationTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine

    def write(self, db, version, role=UserRole.reception, matrix=None):
        return self.fixture.cases(db)[2].update_for_role(role, matrix or get_default_permissions(role), version=version,
            actor_id=self.fixture.admin.id, session_id=self.fixture.session_id)

    def test_required_strict_version_schema(self):
        for data in ({}, *({'version': v} for v in (-1, None, True, '1', 1.5, 2**63-1))):
            with self.subTest(data=data), self.assertRaises(SchemaError):
                RolePermissionUpdateRequest(permissions={}, **data)
        self.assertEqual(RolePermissionUpdateRequest(permissions={}, version=0).version, 0)

    def test_missing_row_is_virtual_zero_and_only_one_first_writer_wins(self):
        with self.engine.begin() as db:
            db.execute(text("DELETE FROM role_permissions WHERE role='reception'"))
        with Session(self.engine) as db:
            self.assertEqual(self.fixture.cases(db)[2].get_versioned(UserRole.reception),
                             (0, get_default_permissions(UserRole.reception)))
            self.assertIsNone(SqlAlchemyRolePermissionRepository(db).get_by_role(UserRole.reception))
        barrier = threading.Barrier(2, timeout=8)
        def worker(_):
            with Session(self.engine) as db:
                barrier.wait()
                try:
                    return SqlAlchemyRolePermissionRepository(db).save(UserRole.reception,
                        get_default_permissions(UserRole.reception), 0).version
                except ConflictError as error:
                    self.assertEqual(error.code, 'stale_version')
                    return 0
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(worker, range(2))), [0, 1])

    def test_concurrent_forms_one_winner_then_explicit_review(self):
        barrier = threading.Barrier(2, timeout=8)
        def worker(allowed):
            matrix = get_default_permissions(UserRole.reception)
            matrix['patients']['create'] = allowed
            with Session(self.engine) as db:
                barrier.wait()
                try:
                    return self.write(db, 1, matrix=matrix).version
                except ConflictError as error:
                    self.assertEqual(error.code, 'stale_version')
                    return 0
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(worker, (False, True))), [0, 2])
        with Session(self.engine) as db:
            before = SqlAlchemyRolePermissionRepository(db).get_by_role(UserRole.reception)
            with self.assertRaises(ConflictError): self.write(db, 1)
            self.assertEqual(SqlAlchemyRolePermissionRepository(db).get_by_role(UserRole.reception), before)
            self.assertEqual(self.write(db, 2).version, 3)
            self.assertEqual(self.write(db, 3).version, 4)  # Accepted no-op still consumes the form version.

    def test_profiles_are_independent_and_cached_identity_is_refreshed(self):
        with Session(self.engine, expire_on_commit=False) as db:
            cached = db.get(RolePermissionModel, UserRole.reception)
            self.assertEqual(cached.version, 1)
            with Session(self.engine) as other: self.write(other, 1)
            with self.assertRaises(ConflictError): self.write(db, 1)
            self.assertEqual(self.write(db, 1, UserRole.coordinator).version, 2)
            self.assertEqual(self.write(db, 2).version, 3)

    def test_failed_commit_preserves_matrix_and_version(self):
        with Session(self.engine) as db:
            before = SqlAlchemyRolePermissionRepository(db).get_by_role(UserRole.reception)
            with patch.object(db, 'commit', side_effect=RuntimeError('Fictitious commit failure')):
                with self.assertRaises(RuntimeError): self.write(db, 1)
            self.assertEqual(SqlAlchemyRolePermissionRepository(db).get_by_role(UserRole.reception), before)
            self.assertEqual(self.write(db, 1).version, 2)

    def test_revoked_actor_does_not_receive_version_conflict(self):
        with Session(self.engine) as db:
            self.fixture.cases(db)[0].revoke_session(self.fixture.session_id, self.fixture.admin.id)
            with self.assertRaises(UnauthorizedError): self.write(db, 0)

    def test_migration_preserves_partial_json_timestamps_and_missing_rows(self):
        migration = self.fixture.fixture.migrate
        self.assertEqual(migration('downgrade', '0022_dentist_user_restrict').returncode, 0)
        with self.engine.begin() as db:
            db.execute(text("DELETE FROM role_permissions WHERE role='dentist'"))
            db.execute(text("UPDATE role_permissions SET permissions=CAST(:raw AS json) WHERE role='reception'"),
                       {'raw': '{"patients":{"view":false},"legacy":{"keep":true}}'})
            before = db.execute(text('SELECT role, permissions::text, created_at, updated_at FROM role_permissions ORDER BY role')).all()
            sessions = db.execute(text('SELECT id, user_id, expires_at FROM auth_sessions ORDER BY id')).all()
        self.assertEqual(migration('upgrade', 'head').returncode, 0)
        with self.engine.connect() as db:
            self.assertEqual(db.execute(text('SELECT role, permissions::text, created_at, updated_at FROM role_permissions ORDER BY role')).all(), before)
            self.assertEqual(db.execute(text('SELECT id, user_id, expires_at FROM auth_sessions ORDER BY id')).all(), sessions)
            self.assertEqual(set(db.scalars(text('SELECT version FROM role_permissions'))), {1})
        self.assertEqual(migration('downgrade', '0022_dentist_user_restrict').returncode, 0)
        self.assertEqual(migration('upgrade', 'head').returncode, 0)
