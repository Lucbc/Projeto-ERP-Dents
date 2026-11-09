"""Read access, stable pagination and revocation on private migrated PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
import threading
import unittest
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.core.use_cases.patient_use_cases import PatientUseCases

import test_administrative_audit as writes
from src.adapters.db.repositories.patient_audit_reader import PatientAuditReader
from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.entities import UserRole
from src.core.domain.exceptions import ForbiddenError, UnauthorizedError, ValidationError
from src.core.permissions import can_access, get_default_permissions, normalize_permissions


class AuditPermissionTests(unittest.TestCase):
    def test_read_only_defaults_and_explicit_grants(self):
        for role in UserRole:
            defaults = get_default_permissions(role)
            self.assertEqual(defaults['patient_audit']['view'], role == UserRole.admin)
            for grant in (False, True):
                matrix = normalize_permissions(role, {'patient_audit': dict.fromkeys(('view','create','update','delete'), grant)})
                self.assertEqual(can_access(role, matrix, 'patient_audit', 'view'), grant or role == UserRole.admin)
                for action in ('create','update','delete'):
                    self.assertFalse(matrix['patient_audit'][action])
                    self.assertFalse(can_access(role, matrix, 'patient_audit', action))


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class AuditReaderTests(unittest.TestCase):
    def setUp(self):
        self.fixture = writes.AdministrativeAuditTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.identity = self.fixture.identity
        self.patient = self.fixture.fixture.fixture.patients[0]
        with Session(self.engine) as db:
            uc = PatientUseCases(SqlAlchemyPatientRepository(db))
            uc.update(self.patient, {'version':1,'notes':'Fictitious private'}, actor_id=self.identity['actor_id'])
            uc.update(self.patient, {'version':2,'notes':None}, actor_id=self.identity['actor_id'])

    def read(self, **filters):
        with Session(self.engine) as db:
            return PatientAuditReader(db).list(**self.identity, **filters)

    def grant(self, value):
        with Session(self.engine) as db:
            permissions = self.fixture.fixture.cases(db)[2]
            version, matrix = permissions.get_versioned(UserRole.reception)
            matrix['patient_audit']['view'] = value
            permissions.update_for_role(UserRole.reception, matrix, version=version, **self.identity)

    def test_keyset_pagination_filters_and_no_writes(self):
        with self.engine.connect() as db:
            before = list(db.scalars(text('SELECT to_jsonb(a)::text FROM patient_audit a ORDER BY id')))
        first = self.read(limit=1)
        self.assertEqual(first['items'][0]['after_version'],3)
        with Session(self.engine) as db:
            PatientUseCases(SqlAlchemyPatientRepository(db)).update(
                self.patient, {'version':3,'active':False}, actor_id=self.identity['actor_id'])
        second = self.read(limit=1, cursor=first['next_cursor'])
        self.assertEqual(second['items'][0]['after_version'],2)
        self.assertIsNone(second['next_cursor'])
        self.assertEqual(len(self.read(patient_id=self.patient)['items']),3)
        self.assertEqual(len(self.read(author_id=self.identity['actor_id'])['items']),3)
        when = first['items'][0]['occurred_at']
        self.assertEqual([e['id'] for e in self.read(since=when,until=when+timedelta(microseconds=1))['items']],
                         [first['items'][0]['id']])
        self.assertEqual(set(first['items'][0]), {'id','occurred_at','actor_id','action','patient_id',
                         'before_version','after_version','changed_fields'})
        with self.engine.connect() as db:
            after = list(db.scalars(text('SELECT to_jsonb(a)::text FROM patient_audit a ORDER BY id')))
        self.assertTrue(set(before).issubset(after))
        self.assertEqual(len(after),len(before)+1)

    def test_tied_timestamps_use_id_and_invalid_filters_fail(self):
        instant = datetime(2026, 1, 1, tzinfo=timezone.utc)
        with self.engine.begin() as db:
            for identifier in (UUID(int=1), UUID(int=2)):
                db.execute(text('''INSERT INTO patient_audit
                    (id,occurred_at,actor_id,action,patient_id,before_version,after_version,changed_fields)
                    VALUES (:id,:time,:actor,'patient.updated',:id,1,2,'{}')'''),
                    {'id': identifier, 'time': instant, 'actor': self.identity['actor_id']})
        first = self.read(until=instant+timedelta(seconds=1), limit=1)
        second = self.read(until=instant+timedelta(seconds=1), limit=1, cursor=first['next_cursor'])
        self.assertEqual([first['items'][0]['id'], second['items'][0]['id']], [UUID(int=2), UUID(int=1)])
        self.assertIsNone(second['next_cursor'])
        for filters in ({'cursor':'!'}, {'cursor':'bnVsbA=='}, {'limit':101}, {'limit':True},
                        {'since':datetime(2026,1,1)}, {'since':instant,'until':instant},
                        {'action':'invalid'}, {'patient_id':'invalid'}):
            with self.subTest(filters=list(filters)):
                with self.assertRaises(ValidationError): self.read(**filters)

    def test_grant_revocation_and_session_rechecked(self):
        restricted = dict(actor_id=self.fixture.target.id, session_id=self.fixture.target_session)
        with Session(self.engine) as db:
            with self.assertRaises(ForbiddenError): PatientAuditReader(db).list(**restricted)
        self.grant(True)
        with Session(self.engine) as db:
            self.assertTrue(PatientAuditReader(db).list(**restricted)['items'])
        self.grant(False)
        with Session(self.engine) as db:
            with self.assertRaises(ForbiddenError): PatientAuditReader(db).list(**restricted)
            SqlAlchemyUserRepository(db).revoke_session(restricted['session_id'], restricted['actor_id'])
            with self.assertRaises(UnauthorizedError): PatientAuditReader(db).list(**restricted)

    def test_permission_revocation_wins_over_waiting_read(self):
        self.grant(True)
        ready, pid = threading.Event(), []
        def attempt():
            with Session(self.engine) as db:
                pid.append(db.scalar(text('SELECT pg_backend_pid()')))
                ready.set()
                with self.assertRaises(ForbiddenError):
                    PatientAuditReader(db).list(actor_id=self.fixture.target.id,
                                                       session_id=self.fixture.target_session)
        with ThreadPoolExecutor(max_workers=1) as pool:
            with Session(self.engine) as db:
                with SqlAlchemyUserRepository(db).administration_lock():
                    future = pool.submit(attempt)
                    self.assertTrue(ready.wait(8))
                    self.fixture.fixture.wait_blocked(pid[0])
                    permissions = self.fixture.fixture.cases(db)[2]
                    version, matrix = permissions.get_versioned(UserRole.reception)
                    matrix['patient_audit']['view'] = False
                    permissions.update_for_role(UserRole.reception, matrix, version=version, **self.identity)
                future.result(timeout=10)
