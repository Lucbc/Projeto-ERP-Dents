"""Stable patient pages, including identical creation timestamps, in a private schema."""
import os
import unittest
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.models.models import PatientModel
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PatientPaginationTests(unittest.TestCase):
    def test_tied_timestamps_have_stable_pages_and_search_counts(self):
        data = fixture.AppointmentConcurrencyTests()
        self.addCleanup(data.doCleanups)
        data.setUp()
        with Session(data.engine) as db:
            db.add_all([PatientModel(id=UUID(int=i), full_name=f'Pagination Fictitious {i:03}',
                        created_at=datetime(2030, 1, 1, tzinfo=timezone.utc)) for i in range(1, 206)])
            db.commit()
            repo = SqlAlchemyPatientRepository(db)
            ids = []
            for offset, size in [(0, 100), (100, 100), (200, 5)]:
                items, total = repo.list('Pagination Fictitious', 100, offset)
                self.assertEqual(total, 205)
                self.assertEqual(len(items), size)
                self.assertEqual([item.id for item in items], [item.id for item in repo.list('Pagination Fictitious', 100, offset)[0]])
                ids.extend(item.id for item in items)
            self.assertEqual(ids, [UUID(int=i) for i in range(205, 0, -1)])
            self.assertEqual(repo.list('Pagination Fictitious 001', 100, 0)[1], 1)
            self.assertEqual(repo.list('Pagination Fictitious', 100, 300), ([], 205))
