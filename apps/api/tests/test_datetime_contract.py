from datetime import datetime, timezone
from unittest import TestCase
from unittest.mock import Mock
from uuid import uuid4

from pydantic import ValidationError as SchemaError
from src.api.schemas.schemas import AppointmentCreateRequest, AppointmentUpdateRequest
from src.core.domain.exceptions import ValidationError
from src.core.use_cases.appointment_use_cases import AppointmentUseCases
import test_financial_clinic_date as financial_fixture


class DatetimeContractTests(TestCase):
    def test_update_omission_and_nullable_notes(self):
        self.assertEqual(AppointmentUpdateRequest(version=1).model_dump(exclude_unset=True), {'version': 1})
        self.assertEqual(AppointmentUpdateRequest(version=1, notes=None).model_dump(exclude_unset=True),
                         {'version': 1, 'notes': None})

    def test_required_fields_reject_explicit_null(self):
        for field in ('start_at', 'end_at', 'patient_id', 'dentist_id', 'status'):
            with self.subTest(field=field), self.assertRaises(SchemaError):
                AppointmentUpdateRequest(version=1, **{field: None})

    def test_create_and_update_reject_naive_times(self):
        base = dict(patient_id=uuid4(), dentist_id=uuid4(), start_at='2030-01-07T13:00:00Z', end_at='2030-01-07T14:00:00Z')
        for field in ('start_at', 'end_at'):
            for value in ('2030-01-07T10:00:00', '2030-01-07'):
                with self.subTest(field=field, value=value):
                    with self.assertRaises(SchemaError):
                        AppointmentCreateRequest(**{**base, field: value})
                    with self.assertRaises(SchemaError):
                        AppointmentUpdateRequest(version=1, **{field: value})

    def test_offset_preserves_microseconds_and_instant(self):
        for stamp in ('2030-01-07T13:00:00.123456Z', '2030-01-07T10:00:00.123456-03:00', '2030-01-07T22:00:00.123456+09:00'):
            result = AppointmentUpdateRequest(version=1, start_at=stamp).start_at
            self.assertEqual(result.astimezone(timezone.utc), datetime(2030, 1, 7, 13, 0, 0, 123456, timezone.utc))

    def test_use_case_guards_internal_inputs_before_writes(self):
        repo = Mock()
        uc = AppointmentUseCases(repo, Mock(), Mock(), Mock())
        aware = datetime(2030, 1, 7, 13, tzinfo=timezone.utc)
        for value in (None, 'invalid', aware.replace(tzinfo=None)):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                uc.create({'start_at': value, 'end_at': aware})
        for field in ('start_at', 'end_at', 'patient_id', 'dentist_id', 'status'):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                uc.update(uuid4(), {'version': 1, field: None})
        for field in ('dt_from', 'dt_to'):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                uc.list(**{'dt_from': None, 'dt_to': None, 'dentist_id': None, 'patient_id': None,
                           field: aware.replace(tzinfo=None)})
        repo.create.assert_not_called()
        repo.update.assert_not_called()
        repo.list.assert_not_called()

    def test_reversed_interval_is_controlled(self):
        uc = AppointmentUseCases(Mock(), Mock(), Mock(), Mock())
        with self.assertRaises(ValidationError):
            uc._validate_datetime(datetime.fromisoformat('2030-01-07T10:00:00-03:00'),
                                  datetime.fromisoformat('2030-01-07T12:59:00+00:00'))

    def test_new_naive_generation_rejected_for_all_statuses(self):
        for status in ('paid', 'pending', 'cancelled'):
            uc, visit, financial, visits = financial_fixture.FinancialClinicDateTests().build('2030-01-07T13:00:00+00:00')
            with self.subTest(status=status), self.assertRaises(ValidationError):
                uc.generate_from_appointment(visit.id, {'status': status, 'paid_at': datetime(2030, 1, 7, 10)})
            financial.create_generated.assert_not_called()
            financial.create_paid.assert_not_called()
            visits.get.assert_not_called()

    def test_exact_legacy_naive_generation_can_recover_without_writing(self):
        uc, visit, financial, visits = financial_fixture.FinancialClinicDateTests().build('2030-01-07T13:00:00+00:00')
        original = object()
        financial.get_generation.return_value = original
        self.assertIs(uc.generate_from_appointment(visit.id, {'idempotency_key': uuid4(),
                      'status': 'pending', 'paid_at': datetime(2030, 1, 7, 10)}), original)
        financial.create_generated.assert_not_called()
        financial.create_paid.assert_not_called()
        visits.get.assert_not_called()
