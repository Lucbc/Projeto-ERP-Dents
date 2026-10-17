"""Read-only duplicate candidates in a private homologation schema."""
from datetime import date
import os
import unittest
from sqlalchemy import func, select
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.models.models import PatientModel
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class DuplicateCandidateTests(unittest.TestCase):
    def test_exact_matches_all_records_minimal_response_and_preservation(self):
        data = fixture.AppointmentConcurrencyTests()
        self.addCleanup(data.doCleanups)
        data.setUp()
        birth = date(1990, 1, 15)
        with Session(data.engine) as db:
            target = PatientModel(full_name='Jo\u00e3o  Ficticio', birth_date=birth, cpf='123.456.789-01', active=False,
                                  notes='Private fictitious notes')
            db.add(target)
            db.commit()
            original = (target.full_name, target.cpf, target.version, target.updated_at)
            db.add_all([PatientModel(full_name='Unrelated Fictitious ' + str(i)) for i in range(105)])
            db.add(PatientModel(full_name='Joao Ficticio Junior', birth_date=birth))
            db.add(PatientModel(full_name='Joao Ficticio', birth_date=date(2000, 1, 15)))
            db.add(PatientModel(full_name='Invalid Historical CPF Fictitious', cpf='abc12345678901'))
            db.commit()
            repo = SqlAlchemyPatientRepository(db)
            count = db.scalar(select(func.count()).select_from(PatientModel))
            for name, birthday, cpf in [('', None, '12345678901'), (' JOAO FICTICIO ', birth, None),
                                       ('Joa\u0303o Ficticio', birth, None), ('Wrong name', None, '123.456.789-01')]:
                result = repo.duplicate_candidates(name, birthday, cpf)
                self.assertEqual(result['total'], 1)
                self.assertTrue(result['checked'])
                self.assertEqual(result['items'][0]['id'], target.id)
                self.assertFalse(result['items'][0]['active'])
                self.assertEqual(set(result['items'][0]), {'id', 'full_name', 'birth_date', 'active', 'same_cpf'})
            for name, birthday, cpf in [('', None, None), ('Joao', None, None), ('', None, '123456'),
                                       ('', None, 'abc12345678901')]:
                self.assertEqual(repo.duplicate_candidates(name, birthday, cpf), {'items': [], 'total': 0, 'checked': False})
            for name in ['Joao', '%', '_', 'Other Person']:
                self.assertEqual(repo.duplicate_candidates(name, birth, None)['total'], 0)
            self.assertEqual(db.scalar(select(func.count()).select_from(PatientModel)), count)
            db.refresh(target)
            self.assertEqual((target.full_name, target.cpf, target.version, target.updated_at), original)
            db.add_all([PatientModel(full_name='Extra Fictitious', cpf='12345678901') for _ in range(11)])
            db.commit()
            result = repo.duplicate_candidates('', None, '12345678901')
            self.assertEqual(result['total'], 12)
            self.assertEqual(len(result['items']), 10)
            self.assertTrue(all(item['same_cpf'] for item in result['items']))
