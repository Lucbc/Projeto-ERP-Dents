"""Payment history invariants in disposable PostgreSQL schemas."""
import os
import hashlib
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from threading import Barrier
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

import test_financial_concurrency as fixture
from src.core.domain.exceptions import ConflictError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class FinancialHistoryTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.FinancialConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine
        self.actor = SimpleNamespace(id=uuid4(), name='Fictitious operator')
        if self._testMethodName in ('test_legacy_import_preserves_timestamp_values_and_unknown_author', 'test_invalid_legacy_migration_is_atomic'):
            self.assertEqual(self.fixture.fixture.migrate('downgrade', '0019_financial_version').returncode, 0)
            with Session(self.engine) as db:
                self.id = self.fixture.legacy_create(db, {**self.fixture.data(), 'status':'pending', 'total_cents':12000}).id
            return
        with Session(self.engine) as db:
            self.id = self.fixture.use_case(db).create(self.fixture.data()).id

    def pay(self, uc, version=1, key=None, **kwargs):
        return uc.mark_as_paid(self.id, version, idempotency_key=key or uuid4(), actor=self.actor, **kwargs)

    def reverse(self, uc, result, key=None):
        return uc.reverse_payment(self.id, result['entry'].version, result['payment']['id'],
                                  key or uuid4(), 'Fictitious correction', self.actor)

    def test_retry_after_reversal_and_new_payment_returns_original_event_and_current_state(self):
        key, reversal_key = uuid4(), uuid4()
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            first = self.pay(uc, key=key)
            reversed_result = self.reverse(uc, first, reversal_key)
            uc.update(self.id, {'version':3, 'amount_cents':20000})
            second = self.pay(uc, version=4)
            retry = self.pay(uc, key=key)
            self.assertTrue(retry['replayed'])
            self.assertEqual(retry['payment']['id'], first['payment']['id'])
            self.assertIsNotNone(retry['reversal'])
            self.assertEqual(retry['entry'].active_payment_id, second['payment']['id'])
            reverse_retry = self.reverse(uc, first, reversal_key)
            self.assertEqual(reverse_retry['reversal']['id'], reversed_result['reversal']['id'])
            self.assertEqual(reverse_retry['entry'].version, 5)
            with self.assertRaises(ConflictError): self.pay(uc, version=5, key=key)
            history = uc.payments(self.id)
            self.assertEqual(len(history), 2)
            self.assertEqual(sorted(p['total_cents'] for p in history), [12000,20000])

    def test_paid_cannot_be_edited_or_deleted_and_history_survives_reversal(self):
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            first = self.pay(uc)
            for data in ({'notes':'changed'}, {'status':'pending'}, {'amount_cents':1}):
                with self.assertRaises(ConflictError): uc.update(self.id, {'version':2, **data})
            with self.assertRaises(ConflictError): uc.delete(self.id, 2)
            self.reverse(uc, first)
            with self.assertRaises(ConflictError): uc.delete(self.id, 3)
            with self.assertRaises(ConflictError): uc.update(self.id, {'version':3, 'status':'paid'})
            uc.update(self.id, {'version':3, 'status':'cancelled'})
            self.assertEqual(len(uc.payments(self.id)), 1)

    def test_same_key_race_converges_and_other_keys_have_one_winner(self):
        for same_key in (True, False):
            with Session(self.engine) as db:
                self.id = self.fixture.use_case(db).create({**self.fixture.data(), 'appointment_id':None}).id
            gate, key = Barrier(2, timeout=15), uuid4()
            def worker(_):
                with Session(self.engine) as db:
                    gate.wait()
                    try:
                        return self.pay(self.fixture.use_case(db), key=key if same_key else uuid4())['payment']['id']
                    except ConflictError: return None
            with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(worker, range(2)))
            if same_key: self.assertEqual(results[0], results[1]); self.assertIsNotNone(results[0])
            else: self.assertEqual(sum(value is not None for value in results), 1)

    def test_events_reject_update_delete_and_failed_insert_rolls_back_entry(self):
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            first = self.pay(uc)
            self.reverse(uc, first)
        for table in ('financial_payments','financial_reversals','financial_operations'):
            for statement in (f'UPDATE {table} SET id=id' if table != 'financial_operations' else f'UPDATE {table} SET key=key', f'DELETE FROM {table}'):
                with self.assertRaises(DBAPIError), self.engine.begin() as db: db.execute(text(statement))
        with self.engine.begin() as db:
            db.execute(text("CREATE FUNCTION reject_test_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rejection'; END $$"))
            db.execute(text('CREATE TRIGGER reject_test_payment BEFORE INSERT ON financial_payments FOR EACH ROW EXECUTE FUNCTION reject_test_payment()'))
        with Session(self.engine) as db:
            with self.assertRaises(DBAPIError): self.pay(self.fixture.use_case(db), version=3)
        with Session(self.engine) as db:
            entry = self.fixture.use_case(db).get(self.id)
            self.assertEqual((entry.version, entry.status.value, entry.active_payment_id), (3,'pending',None))

    def test_paid_creation_and_generation_are_atomic_and_repeatable(self):
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            payload = {**self.fixture.data(), 'appointment_id':None, 'status':'paid', 'idempotency_key':uuid4()}
            first = uc.create(payload, actor=self.actor)
            second = uc.create(payload, actor=self.actor)
            self.assertEqual(first.id, second.id)
            stamp=datetime(2030,1,7,12,34,56,123456,tzinfo=timezone.utc)
            generated = {'status':'paid','idempotency_key':uuid4(),'paid_at':stamp}
            a = uc.generate_from_appointment(self.fixture.appointments[1], generated, actor=self.actor)
            b = uc.generate_from_appointment(self.fixture.appointments[1], {**generated,'paid_at':stamp.astimezone(timezone(timedelta(hours=-3)))}, actor=self.actor)
            self.assertEqual(a.id,b.id)
            self.assertEqual(len(uc.payments(a.id)),1)
            self.assertEqual(uc.payments(a.id)[0]['actor_id'],self.actor.id)

    def test_same_key_paid_manual_creation_with_appointment_recovers_concurrent_result(self):
        gate,key=Barrier(2,timeout=15),uuid4()
        payload={**self.fixture.data(index=1),'status':'paid','idempotency_key':key}
        def worker(_):
            with Session(self.engine) as db:
                gate.wait()
                return self.fixture.use_case(db).create(payload,actor=self.actor).id
        with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,range(2)))
        self.assertEqual(results[0],results[1])
        with Session(self.engine) as db:
            self.assertEqual(len(self.fixture.use_case(db).payments(results[0])),1)

    def test_legacy_import_preserves_timestamp_values_and_unknown_author(self):
        migrate = self.fixture.fixture.migrate
        self.assertEqual(migrate('downgrade','0019_financial_version').returncode,0)
        stamp = datetime(2030,1,7,12,34,56,123456,tzinfo=timezone.utc)
        key=uuid4()
        payload={'status':'paid','idempotency_key':key}
        legacy_hash=hashlib.sha256(json.dumps({'appointment_id':str(self.fixture.appointments[0]),'status':'paid'},sort_keys=True,default=str).encode()).hexdigest()
        with self.engine.begin() as db:
            db.execute(text("UPDATE financial_entries SET status='paid',paid_at=:stamp WHERE id=:id"), {'stamp':stamp,'id':self.id})
            db.execute(text('INSERT INTO financial_generations(key,request_hash,entry_id) VALUES(:key,:hash,:id)'),{'key':key,'hash':legacy_hash,'id':self.id})
        self.assertEqual(migrate('upgrade','head').returncode,0)
        with Session(self.engine) as db:
            uc = self.fixture.use_case(db)
            event = uc.payments(self.id)[0]
            self.assertEqual((event['origin'],event['actor_id'],event['paid_at'],event['total_cents']),('legacy',None,stamp,12000))
            self.assertEqual(uc.get(self.id).version,1)
            self.assertEqual(uc.generate_from_appointment(self.fixture.appointments[0],payload,actor=self.actor).id,self.id)
            self.assertEqual(len(uc.payments(self.id)),1)

    def test_invalid_legacy_migration_is_atomic(self):
        migrate = self.fixture.fixture.migrate
        self.assertEqual(migrate('downgrade','0019_financial_version').returncode,0)
        for invalid in ("status='paid',paid_at=NULL", "status='pending',paid_at=now()", "amount_cents=-1", "total_cents=999"):
            with self.engine.begin() as db:
                db.execute(text("UPDATE financial_entries SET status='pending',paid_at=NULL,amount_cents=12000,total_cents=12000"))
                db.execute(text('UPDATE financial_entries SET '+invalid))
            self.assertNotEqual(migrate('upgrade','head').returncode,0)
            with self.engine.connect() as db:
                self.assertEqual(db.scalar(text('SELECT version_num FROM alembic_version')), '0019_financial_version')
                self.assertIsNone(db.scalar(text("SELECT to_regclass('financial_payments')")))

    def test_reversal_races_have_one_winner_or_one_recovered_event(self):
        for same_key in (True,False):
            with Session(self.engine) as db:
                uc=self.fixture.use_case(db)
                self.id=uc.create({**self.fixture.data(),'appointment_id':None}).id
                paid=self.pay(uc)
            gate,key=Barrier(2,timeout=15),uuid4()
            def worker(_):
                with Session(self.engine) as db:
                    gate.wait()
                    try: return self.reverse(self.fixture.use_case(db),paid,key if same_key else uuid4())['reversal']['id']
                    except ConflictError: return None
            with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(worker,range(2)))
            if same_key: self.assertIsNotNone(results[0]); self.assertEqual(results[0],results[1])
            else: self.assertEqual(sum(value is not None for value in results),1)

    def test_direct_inconsistent_active_snapshot_and_destructive_downgrade_are_rejected(self):
        with Session(self.engine) as db: self.pay(self.fixture.use_case(db))
        for statement in ("UPDATE financial_entries SET amount_cents=1,total_cents=1",
                          "UPDATE financial_entries SET active_payment_id=NULL",
                          "DELETE FROM financial_entries"):
            with self.assertRaises(DBAPIError),self.engine.begin() as db: db.execute(text(statement))
        self.assertNotEqual(self.fixture.fixture.migrate('downgrade','0019_financial_version').returncode,0)
        with self.engine.connect() as db:
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_payments')),1)
            self.assertEqual(db.scalar(text('SELECT version_num FROM alembic_version')),'0022_dentist_user_restrict')

    def test_failed_receipt_rolls_back_payment_and_entry(self):
        with self.engine.begin() as db:
            db.execute(text("CREATE FUNCTION reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rejection'; END $$"))
            db.execute(text('CREATE TRIGGER reject_test_receipt BEFORE INSERT ON financial_operations FOR EACH ROW EXECUTE FUNCTION reject_test_receipt()'))
        with Session(self.engine) as db:
            with self.assertRaises(DBAPIError): self.pay(self.fixture.use_case(db))
        with self.engine.connect() as db:
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_payments')),0)
            self.assertEqual(db.scalar(text('SELECT version FROM financial_entries WHERE id=:id'),{'id':self.id}),1)
