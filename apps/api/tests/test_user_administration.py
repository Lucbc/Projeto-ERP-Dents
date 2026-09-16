"""PostgreSQL regression tests. Run only inside the isolated homologation API.

RUN_HOMOLOG_TESTS=1 python -m unittest discover -s tests -v
Each test creates and drops only its own randomly named schema, never public.
"""
from concurrent.futures import ThreadPoolExecutor
import os
import re
import threading
import time
import unittest
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from src.adapters.db.models.base import Base
from src.adapters.db.models.models import UserModel
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.adapters.db.repositories.role_permission_repository import SqlAlchemyRolePermissionRepository
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ConflictError, ForbiddenError, ValidationError
from src.core.permissions import get_default_permissions
from src.core.use_cases.user_use_cases import UserUseCases


class TestAuth:
    def hash_password(self, password):
        return "test-hash-" + password


@unittest.skipUnless(os.getenv("RUN_HOMOLOG_TESTS") == "1", "Explicit homologation opt-in required")
class UserAdministrationTests(unittest.TestCase):
    def setUp(self):
        url = make_url(os.environ["DATABASE_URL"])
        if url.database != "erp_dents_homolog":
            self.fail("Tests require the erp_dents_homolog database")
        self.schema = "test_users_" + uuid4().hex
        self.root = create_engine(url)
        with self.root.begin() as db:
            db.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        self.engine = create_engine(url, connect_args={"options": f"-csearch_path={self.schema}"})
        self.addCleanup(self.dispose_schema)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine, expire_on_commit=False)
        self.addCleanup(self.db.close)
        self.repo = SqlAlchemyUserRepository(self.db)
        self.permissions = SqlAlchemyRolePermissionRepository(self.db)
        self.uc = UserUseCases(self.repo, TestAuth(), self.permissions)
        self.admin = self.seed("admin", UserRole.admin)
        self.delegate = self.seed("delegate", UserRole.coordinator)
        self.ordinary = self.seed("ordinary", UserRole.reception)
        matrix = get_default_permissions(UserRole.coordinator)
        matrix["users"] = {action: True for action in ("view", "create", "update", "delete")}
        self.permissions.upsert(UserRole.coordinator, matrix)

    def dispose_schema(self):
        self.engine.dispose()
        if not re.fullmatch(r"test_users_[0-9a-f]{32}", self.schema):
            raise RuntimeError("Invalid test schema")
        with self.root.begin() as db:
            db.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
        self.root.dispose()

    def seed(self, name, role, active=True):
        return self.repo.create({"name": name, "email": name + "@example.com", "role": role,
                                 "is_active": active, "password_hash": "test-only"})

    def test_delegate_cannot_create_admin(self):
        with self.assertRaises(ForbiddenError):
            self.uc.create({"role": "admin"}, actor_id=self.delegate.id)

    def test_delegate_cannot_promote_self_or_other(self):
        for target in (self.delegate, self.ordinary):
            with self.subTest(target=target.name), self.assertRaises(ForbiddenError):
                self.uc.update(target.id, {"role": "admin"}, actor_id=self.delegate.id)

    def test_delegate_cannot_modify_delete_demote_or_reset_admin(self):
        operations = [
            lambda: self.uc.update(self.admin.id, {"name": "changed"}, actor_id=self.delegate.id),
            lambda: self.uc.update(self.admin.id, {"email": "other@example.com"}, actor_id=self.delegate.id),
            lambda: self.uc.update(self.admin.id, {"role": "reception"}, actor_id=self.delegate.id),
            lambda: self.uc.update(self.admin.id, {"is_active": False}, actor_id=self.delegate.id),
            lambda: self.uc.set_password(self.admin.id, "test-password", actor_id=self.delegate.id),
            lambda: self.uc.delete(self.admin.id, actor_id=self.delegate.id),
        ]
        for operation in operations:
            with self.subTest(operation=operations.index(operation)), self.assertRaises(ForbiddenError):
                operation()
        self.assertEqual(self.repo.get(self.admin.id).password_hash, "test-only")

    def test_inactive_admin_is_also_protected_from_delegate(self):
        other = self.seed("inactive", UserRole.admin, False)
        with self.assertRaises(ForbiddenError):
            self.uc.set_password(other.id, "test-password", actor_id=self.delegate.id)

    def test_delegation_still_manages_non_admin_users(self):
        user = self.uc.create({"name": "new", "email": "new@example.com", "role": "reception",
                               "password": "test-password"}, actor_id=self.delegate.id)
        self.uc.update(user.id, {"name": "changed"}, actor_id=self.delegate.id)
        self.uc.set_password(user.id, "another-password", actor_id=self.delegate.id)
        self.assertEqual(self.repo.get(user.id).name, "changed")
        self.uc.delete(user.id, actor_id=self.delegate.id)
        self.assertIsNone(self.repo.get(user.id))

    def test_last_active_admin_cannot_be_removed(self):
        operations = [
            lambda: self.uc.delete(self.admin.id, actor_id=self.admin.id),
            lambda: self.uc.update(self.admin.id, {"role": "reception"}, actor_id=self.admin.id),
            lambda: self.uc.update(self.admin.id, {"is_active": False}, actor_id=self.admin.id),
        ]
        for operation in operations:
            with self.subTest(operation=operations.index(operation)), self.assertRaises(ConflictError):
                operation()
        self.assertEqual(self.repo.count_active_admins(), 1)

    def test_inactive_admin_does_not_count_as_backup(self):
        self.seed("inactive", UserRole.admin, False)
        with self.assertRaises(ConflictError):
            self.uc.delete(self.admin.id, actor_id=self.admin.id)

    def test_last_admin_can_edit_identity_and_password(self):
        updated = self.uc.update(self.admin.id, {"name": "Updated Admin"}, actor_id=self.admin.id)
        self.assertEqual(updated.name, "Updated Admin")
        self.uc.set_password(self.admin.id, "test-password", actor_id=self.admin.id)
        self.assertEqual(self.repo.count_active_admins(), 1)

    def test_admin_can_create_promote_and_remove_other_admin(self):
        new = self.uc.create({"name": "new", "email": "new@example.com", "role": "admin",
                              "password": "test-password"}, actor_id=self.admin.id)
        self.uc.set_password(new.id, "other-password", actor_id=self.admin.id)
        self.uc.delete(new.id, actor_id=self.admin.id)
        self.uc.update(self.ordinary.id, {"role": "admin"}, actor_id=self.admin.id)
        self.uc.update(self.ordinary.id, {"role": "reception"}, actor_id=self.admin.id)
        self.assertEqual(self.repo.count_active_admins(), 1)

    def test_non_admin_without_delegation_is_denied(self):
        with self.assertRaises(ForbiddenError):
            self.uc.update(self.delegate.id, {"name": "changed"}, actor_id=self.ordinary.id)

    def test_inactive_actor_is_denied(self):
        actor = self.seed("inactive", UserRole.admin, False)
        with self.assertRaises(ForbiddenError):
            self.uc.update(self.ordinary.id, {"name": "changed"}, actor_id=actor.id)

    def test_null_required_fields_are_rejected_without_losing_admin(self):
        for key in ("name", "email", "role", "is_active"):
            with self.subTest(field=key), self.assertRaises(ValidationError):
                self.uc.update(self.admin.id, {key: None}, actor_id=self.admin.id)
        self.assertEqual(self.repo.count_active_admins(), 1)

    def wait_for_blocked(self, expected):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            count = self.db.scalar(text("""SELECT count(*) FROM pg_locks
                WHERE relation = 'users'::regclass AND mode = 'ShareRowExclusiveLock' AND NOT granted"""))
            if count >= expected:
                return
            time.sleep(0.01)
        self.fail("Concurrent writers did not wait on the administration lock")

    def concurrent_loss(self, operation):
        second = self.seed("second", UserRole.admin)
        ready = threading.Barrier(3)
        def remove(actor_id):
            with Session(self.engine, expire_on_commit=False) as db:
                repo = SqlAlchemyUserRepository(db)
                # Simulate authentication fetching an ORM identity before the operation waits.
                cached = db.get(UserModel, actor_id)
                self.assertTrue(cached.is_active)
                ready.wait(timeout=5)
                uc = UserUseCases(repo, TestAuth(), SqlAlchemyRolePermissionRepository(db))
                try:
                    if operation == "delete": uc.delete(actor_id, actor_id=actor_id)
                    else: uc.update(actor_id, operation, actor_id=actor_id)
                    return "success"
                except ConflictError:
                    return "conflict"
        with ThreadPoolExecutor(max_workers=2) as pool:
            with self.repo.administration_lock():
                futures = [pool.submit(remove, actor.id) for actor in (self.admin, second)]
                ready.wait(timeout=5)
                self.wait_for_blocked(2)
            results = [future.result(timeout=10) for future in futures]
        self.assertEqual(sorted(results), ["conflict", "success"])
        self.assertEqual(self.repo.count_active_admins(), 1)

    def test_concurrent_admin_deletions(self): self.concurrent_loss("delete")
    def test_concurrent_admin_demotions(self): self.concurrent_loss({"role": "reception"})
    def test_concurrent_admin_deactivations(self): self.concurrent_loss({"is_active": False})

    def test_actor_is_reloaded_after_waiting_for_lock(self):
        second = self.seed("second", UserRole.admin)
        ready = threading.Event()
        def attempt():
            with Session(self.engine, expire_on_commit=False) as db:
                cached = db.get(UserModel, second.id)
                self.assertEqual(cached.role, UserRole.admin)
                ready.set()
                uc = UserUseCases(SqlAlchemyUserRepository(db), TestAuth(), SqlAlchemyRolePermissionRepository(db))
                with self.assertRaises(ForbiddenError):
                    uc.update(self.ordinary.id, {"name": "changed"}, actor_id=second.id)
        with ThreadPoolExecutor(max_workers=1) as pool:
            with self.repo.administration_lock():
                future = pool.submit(attempt)
                self.assertTrue(ready.wait(timeout=5))
                self.wait_for_blocked(1)
                self.repo.update(second.id, {"role": UserRole.reception})
            future.result(timeout=10)
        self.assertEqual(self.repo.get(self.ordinary.id).name, "ordinary")


if __name__ == "__main__":
    unittest.main(verbosity=2)
