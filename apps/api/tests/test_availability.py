"""Strict input clocks and full-precision appointment boundaries; no clock-dependent dates."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock
import unittest
from pydantic import ValidationError as SchemaError

from src.api.schemas.schemas import DentistCreateRequest, DentistUpdateRequest, DentistResponse
from src.core.domain.availability import parse_clock
from src.core.domain.exceptions import ValidationError
from src.core.use_cases.dentist_use_cases import DentistUseCases
from src.core.use_cases.appointment_use_cases import AppointmentUseCases


def slot(start='08:00', end='10:30', day='monday'):
    return dict(day_of_week=day, start_time=start, end_time=end)


class AvailabilityTests(unittest.TestCase):
    def test_invalid_clocks_days_and_ranges_agree_between_schema_and_domain(self):
        invalid=[slot(start=value,end='23:59') for value in (
            '24:00','25:00','08:60','8:00','08:00:00',' 08:00','08:00 ','０８:００','08:00\n','',None,800)]
        invalid += [slot(day=value) for value in ('holiday','MONDAY',None)]
        invalid += [slot('10:30','10:30'),slot('18:00','08:00')]
        for value in invalid:
            with self.subTest(value=value):
                for schema,data in ((DentistCreateRequest,{'full_name':'Fictitious'}),(DentistUpdateRequest,{'version':1})):
                    with self.assertRaises(SchemaError): schema.model_validate({**data,'availability':[value]})
                repo=Mock(); uc=DentistUseCases(repo)
                with self.assertRaises(ValidationError): uc.create({'full_name':'Fictitious','availability':[value]})
                with self.assertRaises(ValidationError): uc.update('id',{'version':1,'availability':[value]})
                repo.create.assert_not_called(); repo.update.assert_not_called()

    def test_valid_extremes_duplicates_sorting_and_empty_schedule_preserved(self):
        values=[slot('00:00','23:59',day='sunday'),slot(),slot()]
        uc=DentistUseCases(Mock())
        expected=[slot(),slot('00:00','23:59',day='sunday')]
        self.assertEqual(uc._normalize_availability(values),expected)
        self.assertEqual(uc._normalize_availability(None),[])
        self.assertEqual(uc._normalize_availability([]),[])
        self.assertEqual(DentistCreateRequest(full_name='Fictitious',availability=expected).model_dump()['availability'],expected)
        self.assertEqual(parse_clock('00:00').hour,0)
        self.assertEqual(parse_clock('23:59').minute,59)

    def test_exact_boundary_accepts_and_one_microsecond_outside_rejects(self):
        uc=AppointmentUseCases(None,None,None,None)
        dentist=SimpleNamespace(active=True,availability=[slot()])
        start=datetime(2030,1,7,11,tzinfo=timezone.utc)  # Monday 08:00 in Sao Paulo.
        end=start+timedelta(hours=2,minutes=30)
        uc._validate_dentist_availability(dentist,start,end)
        for before,after in ((timedelta(microseconds=1),timedelta()),(timedelta(),timedelta(microseconds=1)),
                             (timedelta(),timedelta(seconds=59))):
            with self.assertRaises(ValidationError): uc._validate_dentist_availability(dentist,start-before,end+after)

    def test_timezone_naive_convention_and_midnight_are_preserved(self):
        uc=AppointmentUseCases(None,None,None,None)
        dentist=SimpleNamespace(active=True,availability=[slot('20:00','23:59')])
        # Tuesday UTC is still Monday locally.
        uc._validate_dentist_availability(dentist,datetime(2030,1,8,0,tzinfo=timezone.utc),datetime(2030,1,8,1,tzinfo=timezone.utc))
        uc._validate_dentist_availability(dentist,datetime(2030,1,7,21),datetime(2030,1,7,22))
        with self.assertRaises(ValidationError): uc._validate_dentist_availability(dentist,datetime(2030,1,7,23),datetime(2030,1,8,0))

    def test_pauses_and_adjacent_slots_are_not_merged_and_inactive_denied(self):
        uc=AppointmentUseCases(None,None,None,None)
        dentist=SimpleNamespace(active=True,availability=[slot('08:00','10:00'),slot('10:00','12:00'),slot('14:00','18:00')])
        for start,end in ((9,11),(11,15)):
            with self.assertRaises(ValidationError): uc._validate_dentist_availability(dentist,datetime(2030,1,7,start),datetime(2030,1,7,end))
        dentist.active=False
        with self.assertRaises(ValidationError): uc._validate_dentist_availability(dentist,datetime(2030,1,7,8),datetime(2030,1,7,9))

    def test_legacy_invalid_slots_do_not_grant_availability_or_prevent_reading(self):
        from uuid import uuid4
        values=[slot('25:00','26:00'),slot('08:00:30','12:00'),slot(day='holiday')]
        fields=dict(id=uuid4(),version=1,full_name='Fictitious legacy',cro=None,phone=None,email=None,specialty=None,
            color=None,availability=values,active=True,created_at=datetime.now(timezone.utc),updated_at=datetime.now(timezone.utc))
        self.assertEqual(DentistResponse.model_validate(fields).model_dump()['availability'],values)
        uc=AppointmentUseCases(None,None,None,None)
        dentist=SimpleNamespace(active=True,availability=[*values,None])
        with self.assertRaises(ValidationError): uc._validate_dentist_availability(dentist,datetime(2030,1,7,9),datetime(2030,1,7,10))
        dentist.availability.append(slot())
        uc._validate_dentist_availability(dentist,datetime(2030,1,7,9),datetime(2030,1,7,10))

    def test_cancelled_booking_still_bypasses_availability_but_not_duration(self):
        repo,patients,dentists,procedures=Mock(),Mock(),Mock(),Mock()
        dentists.get.return_value=SimpleNamespace(active=False,availability=[])
        uc=AppointmentUseCases(repo,patients,dentists,procedures)
        data=dict(patient_id='patient',dentist_id='dentist',start_at=datetime(2030,1,7,8),
            end_at=datetime(2030,1,7,9),status='cancelled')
        uc.create(dict(data));repo.create.assert_called_once()
        with self.assertRaises(ValidationError): uc.create({**data,'end_at':data['start_at']})
        self.assertEqual(repo.create.call_count,1)
