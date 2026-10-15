"""Timezone-independent generation and immutable replay in a private schema."""
import os
import unittest
from datetime import date
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session
import test_financial_concurrency as fixture
from src.core.domain.exceptions import ConflictError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class FinancialClinicDateDatabaseTests(unittest.TestCase):
    def test_session_zones_explicit_dates_and_historical_replay(self):
        data = fixture.FinancialConcurrencyTests()
        self.addCleanup(data.doCleanups)
        data.setUp()
        visit_id = data.appointments[0]
        receipts = []
        with Session(data.engine) as db:
            db.execute(text("UPDATE appointments SET start_at='2030-01-08T01:30:00Z', end_at='2030-01-08T02:00:00Z' WHERE id=:id"), {'id': visit_id})
            db.commit()
            for zone in ('UTC', 'America/Sao_Paulo', 'Asia/Tokyo'):
                db.execute(text("SELECT set_config('TimeZone', :zone, false)"), {'zone': zone})
                db.commit()
                self.assertEqual(db.scalar(text('SHOW TimeZone')), zone)
                for due in ({}, {'due_date': None}, {'due_date': date(2030, 2, 10)}):
                    with self.subTest(zone=zone, due=due):
                        uc = data.use_case(db)
                        payload = {**due, 'idempotency_key': uuid4()}
                        entry = uc.generate_from_appointment(visit_id, payload)
                        expected = due.get('due_date') or date(2030, 1, 7)
                        self.assertEqual(entry.due_date, expected)
                        self.assertTrue(entry.description.endswith('07/01/2030 22:30'))
                        saved = db.execute(text('SELECT due_date, description FROM financial_entries WHERE id=:id'), {'id': entry.id}).one()
                        self.assertEqual(saved.due_date, expected)
                        self.assertEqual(saved.description, entry.description)
                        self.assertEqual(uc.generate_from_appointment(visit_id, payload).id, entry.id)
                        with self.assertRaises(ConflictError):
                            uc.generate_from_appointment(visit_id, {**payload, 'notes': 'Fictitious changed request'})
                        uc.update(entry.id, {'version': entry.version, 'status': 'cancelled'})
                        receipts.append((entry.id, payload))
            # Model a receipt created before the conversion rule. It must not be recalculated.
            old_id, old_payload = receipts[0]
            db.execute(text("UPDATE financial_entries SET due_date='2030-01-08', description='Fictitious historical UTC text' WHERE id=:id"), {'id': old_id})
            db.commit()
            before = db.execute(text('SELECT due_date, description, version FROM financial_entries WHERE id=:id'), {'id': old_id}).one()
            replay = data.use_case(db).generate_from_appointment(visit_id, old_payload)
            self.assertEqual((replay.due_date, replay.description, replay.version), tuple(before))
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_entries')), 9)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM financial_generations')), 9)
