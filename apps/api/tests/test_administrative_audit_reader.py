"""Read access, stable pagination and revocation on private migrated PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
import threading
import unittest
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

import test_administrative_audit as writes
from src.adapters.db.repositories.administrative_audit_reader import AdministrativeAuditReader
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ForbiddenError, UnauthorizedError, ValidationError
from src.core.permissions import can_access, get_default_permissions, normalize_permissions


class AuditPermissionTests(unittest.TestCase):
    def test_read_only_defaults_and_explicit_grants(self):
        for role in UserRole:
            defaults = get_default_permissions(role)
            self.assertEqual(defaults['administrative_audit']['view'], role == UserRole.admin)
            for grant in (False, True):
                matrix = normalize_permissions(role, {'administrative_audit': dict.fromkeys(('view','create','update','delete'), grant)})
                self.assertEqual(can_access(role, matrix, 'administrative_audit', 'view'), grant or role == UserRole.admin)
                for action in ('create','update','delete'):
                    self.assertFalse(matrix['administrative_audit'][action])
                    self.assertFalse(can_access(role, matrix, 'administrative_audit', action))


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class AuditReaderTests(unittest.TestCase):
    def setUp(self):
        self.fixture = writes.AdministrativeAuditTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.identity = self.fixture.identity
        with Session(self.engine) as db:
            self.created = self.fixture.write(db, 'create')
            self.fixture.uc(db).update(self.created.id, {'version': 1, 'name': 'Fictitious Changed'}, **self.identity)

    def read(self, **filters):
        with Session(self.engine) as db:
            return AdministrativeAuditReader(db).list(**self.identity, **filters)

    def grant(self, value):
        with Session(self.engine) as db:
            permissions = self.fixture.fixture.cases(db)[2]
            version, matrix = permissions.get_versioned(UserRole.reception)
            matrix['administrative_audit']['view'] = value
            permissions.update_for_role(UserRole.reception, matrix, version=version, **self.identity)

    def test_keyset_pagination_filters_and_no_writes(self):
        before = self.fixture.fingerprint()
        first = self.read(limit=1)
        self.assertEqual(first['items'][0]['action'], 'user.updated')
        self.assertEqual(self.fixture.fingerprint(), before)
        with Session(self.engine) as db:
            self.fixture.uc(db).delete(self.created.id, version=2, **self.identity)
        second = self.read(limit=1, cursor=first['next_cursor'])
        self.assertEqual(second['items'][0]['action'], 'user.created')
        self.assertIsNone(second['next_cursor'])
        self.assertEqual(len(self.read(target_user_id=self.created.id)['items']), 3)
        self.assertEqual(len(self.read(action='user.deleted', author_id=self.identity['actor_id'])['items']), 1)
        when = first['items'][0]['occurred_at']
        self.assertEqual([e['id'] for e in self.read(since=when, until=when+timedelta(microseconds=1))['items']],
                         [first['items'][0]['id']])
        self.assertEqual(self.read(until=when)['items'][0]['action'], 'user.created')
        self.assertEqual(self.read(target_role=UserRole.reception)['items'], [])
        self.assertEqual(set(first['items'][0]), {'id','occurred_at','actor_id','action','target_user_id',
                         'target_role','before_version','after_version','changed_fields','permission_changes'})

    def test_tied_timestamps_use_id_and_invalid_filters_fail(self):
        instant = datetime(2026, 1, 1, tzinfo=timezone.utc)
        with self.engine.begin() as db:
            for identifier in (UUID(int=1), UUID(int=2)):
                db.execute(text('''INSERT INTO administrative_audit
                    (id,occurred_at,actor_id,action,target_user_id,after_version)
                    VALUES (:id,:time,:actor,'user.created',:actor,1)'''),
                    {'id': identifier, 'time': instant, 'actor': self.identity['actor_id']})
        first = self.read(until=instant+timedelta(seconds=1), limit=1)
        second = self.read(until=instant+timedelta(seconds=1), limit=1, cursor=first['next_cursor'])
        self.assertEqual([first['items'][0]['id'], second['items'][0]['id']], [UUID(int=2), UUID(int=1)])
        self.assertIsNone(second['next_cursor'])
        for filters in ({'cursor':'!'}, {'cursor':'bnVsbA=='}, {'limit':101}, {'limit':True},
                        {'since':datetime(2026,1,1)}, {'since':instant,'until':instant},
                        {'action':'invalid'}, {'target_user_id':self.created.id,'target_role':'admin'}):
            with self.subTest(filters=list(filters)):
                with self.assertRaises(ValidationError): self.read(**filters)

    def test_grant_revocation_and_session_rechecked(self):
        restricted = dict(actor_id=self.fixture.target.id, session_id=self.fixture.target_session)
        with Session(self.engine) as db:
            with self.assertRaises(ForbiddenError): AdministrativeAuditReader(db).list(**restricted)
        self.grant(True)
        with Session(self.engine) as db:
            self.assertTrue(AdministrativeAuditReader(db).list(**restricted)['items'])
        self.grant(False)
        with Session(self.engine) as db:
            with self.assertRaises(ForbiddenError): AdministrativeAuditReader(db).list(**restricted)
            SqlAlchemyUserRepository(db).revoke_session(restricted['session_id'], restricted['actor_id'])
            with self.assertRaises(UnauthorizedError): AdministrativeAuditReader(db).list(**restricted)

    def test_permission_revocation_wins_over_waiting_read(self):
        self.grant(True)
        ready, pid = threading.Event(), []
        def attempt():
            with Session(self.engine) as db:
                pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                ready.set()
                with self.assertRaises(ForbiddenError):
                    AdministrativeAuditReader(db).list(actor_id=self.fixture.target.id,
                                                       session_id=self.fixture.target_session)
        with ThreadPoolExecutor(max_workers=1) as pool:
            with Session(self.engine) as db:
                with SqlAlchemyUserRepository(db).administration_lock():
                    future = pool.submit(attempt)
                    self.assertTrue(ready.wait(8))
                    self.fixture.fixture.wait_blocked(pid[0])
                    permissions = self.fixture.fixture.cases(db)[2]
                    version, matrix = permissions.get_versioned(UserRole.reception)
                    matrix['administrative_audit']['view'] = False
                    permissions.update_for_role(UserRole.reception, matrix, version=version, **self.identity)
                future.result(timeout=10)
