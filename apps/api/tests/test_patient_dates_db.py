from datetime import date, datetime, timezone
import os
import unittest
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.models.models import PatientModel
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.core.domain.patient_dates import validate_birth_date
from src.core.domain.exceptions import ConflictError, ValidationError


class PatientDateRulesTests(unittest.TestCase):
    def test_clinic_day_uses_sao_paulo_at_utc_midnight(self):
        instant = datetime(2030, 1, 2, 1, tzinfo=timezone.utc)
        for value in (None, date(2030, 1, 1), date(2000, 2, 29), date(1, 1, 1)):
            validate_birth_date(value, instant)
        with self.assertRaises(ValidationError):
            validate_birth_date(date(2030, 1, 2), instant)
        validate_birth_date(date(2030, 1, 2), datetime(2030, 1, 2, 3, tzinfo=timezone.utc))


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PatientDatesDbTests(unittest.TestCase):
    def test_future_rejected_without_partial_writes_and_legacy_preserved(self):
        data = fixture.AppointmentConcurrencyTests()
        self.addCleanup(data.doCleanups)
        data.setUp()
        with Session(data.engine) as db:
            repo = SqlAlchemyPatientRepository(db)
            with self.assertRaises(ValidationError):
                repo.create(dict(full_name='Future Fictitious', birth_date=date(9999, 12, 31)))
            legacy = PatientModel(full_name='Legacy Future Fictitious', birth_date=date(9999, 12, 31))
            db.add(legacy)
            db.commit()
            original = repo.get(legacy.id)
            for payload in ({'notes':'Kept'}, {'notes':'Kept again', 'birth_date':original.birth_date}):
                original = repo.update(original.id, dict(version=original.version, **payload))
                self.assertEqual(original.birth_date,date(9999, 12, 31))
            with self.assertRaises(ValidationError):
                repo.update(original.id, dict(version=original.version, birth_date=date(9999, 12, 30), notes='Must not persist'))
            self.assertFalse(db.in_transaction())
            saved = repo.get(original.id)
            self.assertEqual((saved.birth_date,saved.notes,saved.version),(original.birth_date,original.notes,original.version))
            cleared = repo.update(saved.id, dict(version=saved.version,birth_date=None))
            self.assertIsNone(cleared.birth_date)
            with self.assertRaises(ConflictError):
                repo.update(saved.id, dict(version=saved.version,birth_date=saved.birth_date))
            corrected = repo.update(cleared.id,dict(version=cleared.version,birth_date=date(2000,2,29)))
            self.assertEqual(corrected.birth_date,date(2000,2,29))
            self.assertIsNone(repo.create(dict(full_name='No Date Fictitious')).birth_date)
