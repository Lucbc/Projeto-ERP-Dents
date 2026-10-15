"""Civil defaults derived from appointment instants, with fictitious repositories."""
from datetime import date, datetime
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock
from uuid import uuid4

from src.core.use_cases.financial_use_cases import FinancialUseCases


class FinancialClinicDateTests(TestCase):
    def build(self, stamp):
        appointment = SimpleNamespace(id=uuid4(), patient_id=uuid4(), dentist_id=uuid4(),
            procedure_ids=[uuid4()], patient_name='Fictitious', start_at=datetime.fromisoformat(stamp))
        financial = Mock()
        financial.create_generated.side_effect = lambda payload, *args: payload
        financial.operation.return_value = None
        financial.get_generation.return_value = None
        visits = Mock(get=Mock(return_value=appointment))
        uc = FinancialUseCases(financial, visits, Mock(), Mock(),
            Mock(get=Mock(return_value=SimpleNamespace(price_cents=12000))))
        return uc, appointment, financial, visits

    def test_equivalent_offsets_and_omitted_or_null_due_date(self):
        for stamp in ('2030-01-08T01:30:00+00:00', '2030-01-07T22:30:00-03:00', '2030-01-08T10:30:00+09:00'):
            for data in ({}, {'due_date': None}):
                with self.subTest(stamp=stamp, data=data):
                    uc, visit, _, _ = self.build(stamp)
                    result = uc.generate_from_appointment(visit.id, data)
                    self.assertEqual(result['due_date'], date(2030, 1, 7))
                    self.assertEqual(result['description'], 'Consulta - Fictitious - 07/01/2030 22:30')

    def test_explicit_due_date_does_not_change_clinic_description(self):
        for stamp in ('2030-01-08T01:30:00+00:00', '2030-01-07T22:30:00-03:00', '2030-01-08T10:30:00+09:00'):
            with self.subTest(stamp=stamp):
                uc, visit, _, _ = self.build(stamp)
                result = uc.generate_from_appointment(visit.id, {'due_date': date(2030, 2, 10)})
                self.assertEqual(result['due_date'], date(2030, 2, 10))
                self.assertEqual(result['description'], 'Consulta - Fictitious - 07/01/2030 22:30')

    def test_midnight_summer_time_and_legacy_naive_convention(self):
        for stamp, day, clock in (
            ('2030-01-08T03:00:00+00:00', date(2030, 1, 8), '08/01/2030 00:00'),
            ('2018-01-15T01:30:00+00:00', date(2018, 1, 14), '14/01/2018 23:30'),
            ('2030-01-07T22:30:00', date(2030, 1, 7), '07/01/2030 22:30'),
        ):
            with self.subTest(stamp=stamp):
                uc, visit, _, _ = self.build(stamp)
                result = uc.generate_from_appointment(visit.id, {})
                self.assertEqual(result['due_date'], day)
                self.assertTrue(result['description'].endswith(clock))

    def test_receipt_replay_returns_history_without_reading_appointment(self):
        for receipt in ('operation', 'generation'):
            with self.subTest(receipt=receipt):
                uc, visit, financial, visits = self.build('2030-01-08T01:30:00+00:00')
                historical = SimpleNamespace(due_date=date(2030, 1, 8), description='Fictitious historical UTC text')
                if receipt == 'operation':
                    financial.operation.return_value = {'entry': historical}
                else:
                    financial.get_generation.return_value = historical
                result = uc.generate_from_appointment(visit.id, {'idempotency_key': uuid4()})
                self.assertIs(result, historical)
                visits.get.assert_not_called()
                financial.create_generated.assert_not_called()
