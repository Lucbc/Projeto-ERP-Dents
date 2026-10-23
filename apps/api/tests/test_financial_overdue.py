"""Overdue is a read-time projection, never a persisted status transition."""
import os
import time
import unittest
from datetime import date, datetime
from unittest.mock import patch

from sqlalchemy import text
from sqlalchemy.orm import Session

import test_financial_concurrency as fixture
from src.adapters.db.repositories.financial_repository import SqlAlchemyFinancialRepository
from src.core.domain.clinic_clock import clinic_today


class ClinicClockTests(unittest.TestCase):
    def test_midnight_and_calendar_boundaries(self):
        for instant, expected in (
            ('2030-01-08T02:59:59+00:00', '2030-01-07'),
            ('2030-01-08T03:00:00+00:00', '2030-01-08'),
            ('2030-01-01T02:59:59+00:00', '2029-12-31'),
            ('2028-03-01T02:59:59+00:00', '2028-02-29'),
            ('2018-01-08T01:59:59+00:00', '2018-01-07'),
            ('2018-01-08T02:00:00+00:00', '2018-01-08'),
        ):
            with self.subTest(instant=instant), patch('src.core.domain.clinic_clock.datetime') as clock:
                clock.now.return_value = datetime.fromisoformat(instant)
                self.assertEqual(clinic_today().isoformat(), expected)


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class FinancialOverdueTests(unittest.TestCase):
    def test_projection_summary_and_storage_across_process_zones(self):
        data = fixture.FinancialConcurrencyTests()
        self.addCleanup(data.doCleanups)
        data.setUp()
        previous_zone = os.environ.get('TZ')
        def restore_zone():
            if previous_zone is None:
                os.environ.pop('TZ', None)
            else:
                os.environ['TZ'] = previous_zone
            time.tzset()
        self.addCleanup(restore_zone)
        with Session(data.engine) as db:
            uc = data.use_case(db)
            for kind in ('income', 'expense'):
                for status in ('pending', 'paid', 'cancelled'):
                    for day in (6, 7, 8):
                        entry = uc.create(dict(entry_type=kind, status='pending' if status == 'paid' else status,
                            description='Fictitious overdue fixture', amount_cents=12000,
                            due_date=date(2030, 1, day)))
                        if status == 'paid':
                            fixture.settle(uc, entry.id, entry.version)
            snapshot = lambda: db.execute(text('SELECT * FROM financial_entries ORDER BY id')).all()
            before = snapshot()
            repo = SqlAlchemyFinancialRepository(db)
            for zone in ('UTC', 'America/Sao_Paulo', 'Asia/Tokyo'):
                os.environ['TZ'] = zone
                time.tzset()
                db.execute(text("SELECT set_config('TimeZone', :zone, false)"), {'zone': zone})
                for instant, day in (('2030-01-08T02:59:59+00:00', 7), ('2030-01-08T03:00:00+00:00', 8)):
                    # Simulate the pre-fix local date at the same instant as the clinical clock.
                    class LocalDate(date):
                        @classmethod
                        def today(cls):
                            return datetime.fromisoformat(instant).astimezone().date()
                    with self.subTest(zone=zone, instant=instant), patch('src.core.domain.clinic_clock.datetime') as clock, patch('src.adapters.db.repositories.financial_repository.date', LocalDate):
                        clock.now.return_value = datetime.fromisoformat(instant)
                        entries, total = repo.list(None, None, None, None, None, None, None, None, 100, 0)
                        self.assertEqual(total, 18)
                        for entry in entries:
                            self.assertEqual(entry.is_overdue, entry.status == 'pending' and entry.due_date.day < day)
                        self.assertEqual(clock.now.call_count, 1, 'One clinical day per list')
                        clock.now.reset_mock()
                        summary = repo.summarize(None, None)
                        self.assertEqual(clock.now.call_count, 1)
                        self.assertEqual(summary.overdue_income_cents, (day - 6) * 12000)
                        self.assertEqual(summary.income_total_cents, 72000)
                        self.assertEqual(summary.expense_total_cents, 72000)
                        self.assertEqual(summary.received_cents, 36000)
                        self.assertEqual(summary.paid_expense_cents, 36000)
                        self.assertEqual(summary.pending_income_cents, 36000)
                        self.assertEqual(summary.pending_expense_cents, 36000)
                        self.assertEqual(summary.balance_cents, 0)
                        self.assertEqual(summary.entries_count, 12)
                        for entry in entries:
                            self.assertEqual(repo.get(entry.id).is_overdue, entry.is_overdue)
                        self.assertEqual(snapshot(), before)

    def test_list_keeps_one_day_when_clock_crosses_midnight(self):
        from unittest.mock import Mock
        repo = SqlAlchemyFinancialRepository(Mock())
        repo.session.scalar.return_value = 2
        repo.session.execute.return_value.all.return_value = [(object(), None, None)] * 2
        repo._to_entity = Mock()
        with patch('src.core.domain.clinic_clock.datetime') as clock:
            clock.now.side_effect = [datetime.fromisoformat('2030-01-08T02:59:59+00:00'), datetime.fromisoformat('2030-01-08T03:00:00+00:00')]
            repo.list(None, None, None, None, None, None, None, None, 100, 0)
            self.assertEqual(clock.now.call_count, 1)
            self.assertEqual([call.kwargs['today'] for call in repo._to_entity.call_args_list], [date(2030, 1, 7)] * 2)
