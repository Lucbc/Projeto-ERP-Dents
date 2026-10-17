"""Patient lookup on PostgreSQL using exclusively fictional private-schema data."""
import os
import unittest
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.models.models import PatientModel
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class PatientSearchTests(unittest.TestCase):
    def test_accent_insensitive_names_preserve_pages_and_stored_values(self):
        data = fixture.AppointmentConcurrencyTests()
        self.addCleanup(data.doCleanups)
        data.setUp()
        with Session(data.engine) as db:
            first = PatientModel(full_name='Jo\u00e3o Gon\u00e7alves Ficticio', preferred_name='Jos\u00e9 Piloto')
            second = PatientModel(full_name='Joao Goncalves Ficticio', preferred_name='Jose Piloto')
            third = PatientModel(full_name='Joa\u0303o Gonc\u0327alves Ficticio', preferred_name='Jose\u0301 Piloto')
            db.add_all([first, second, third])
            db.commit()
            expected = {item.id: (item.full_name, item.preferred_name, item.version, item.updated_at)
                        for item in (first, second, third)}
            repo = SqlAlchemyPatientRepository(db)
            for term in ('joao goncalves', 'JO\u00c3O GON\u00c7ALVES', 'Joa\u0303o Gonc\u0327alves',
                         'jose piloto', 'JOS\u00c9 PILOTO', 'Jose\u0301 Piloto', 'goncal', '  joao  '):
                with self.subTest(term=term):
                    pages = [repo.list(term, 1, offset) for offset in range(4)]
                    self.assertEqual([total for _, total in pages], [3] * 4)
                    ids = [item.id for items, _ in pages for item in items]
                    self.assertEqual(len(ids), 3)
                    self.assertEqual(set(ids), set(expected))
                    self.assertEqual(pages[-1][0], [])
            for term in ('joana goncalves', 'jose inexistente', '\u0300', '\u0308'):
                self.assertEqual(repo.list(term, 100, 0), ([], 0))
            db.expire_all()
            for patient_id, values in expected.items():
                saved = db.get(PatientModel, patient_id)
                self.assertEqual((saved.full_name, saved.preferred_name, saved.version, saved.updated_at), values)

    def test_preferred_name_and_cpf_formats_preserve_counts_and_values(self):
        data = fixture.AppointmentConcurrencyTests()
        self.addCleanup(data.doCleanups)
        data.setUp()
        with Session(data.engine) as db:
            first = PatientModel(full_name='Busca Ficticia Alfa', preferred_name='Social Ficticio Compartilhado',
                                 cpf='123.456.789-01', phone='5511987654321', email='busca@example.com')
            second = PatientModel(full_name='Busca Ficticia Beta', preferred_name='Social Ficticio Compartilhado',
                                  cpf='98765432109', phone='(11) 5555-0000', rg='RG-TESTE', insurance_provider='Convenio Ficticio')
            db.add_all([first, second, PatientModel(full_name='Busca Ficticia Sem Documento')])
            db.commit()
            repo = SqlAlchemyPatientRepository(db)
            for term, expected in [('12345678901', first.id), (' 123.456.789-01 ', first.id),
                                   ('123 456 789 01', first.id), ('456789', first.id),
                                   ('987.654.321-09', second.id), ('98765432109', second.id),
                                   ('busca@example.com', first.id), ('RG-TESTE', second.id),
                                   ('Convenio Ficticio', second.id), ('(11) 5555-0000', second.id),
                                   ('1155550000', second.id), ('55550000', second.id),
                                   ('+55 (11) 98765-4321', first.id), (' 11 98765 4321 ', first.id)]:
                with self.subTest(term=term):
                    items, total = repo.list(term, 100, 0)
                    self.assertEqual(total, 1)
                    self.assertEqual([item.id for item in items], [expected])
            pages = [repo.list('social ficticio compartilhado', 1, offset) for offset in (0, 1, 2)]
            self.assertEqual([total for _, total in pages], [2, 2, 2])
            self.assertEqual({item.id for items, _ in pages for item in items}, {first.id, second.id})
            self.assertEqual([len(items) for items, _ in pages], [1, 1, 0])
            for term in ['texto12345678901', '00000000000', '...---', 'Social Inexistente',
                         'telefone1155550000', '+()-', '99999999999']:
                self.assertEqual(repo.list(term, 100, 0), ([], 0))
            db.expire_all()
            self.assertEqual(db.get(PatientModel, first.id).cpf, '123.456.789-01')
            self.assertEqual(db.get(PatientModel, second.id).cpf, '98765432109')
            self.assertEqual(db.get(PatientModel, first.id).phone, '5511987654321')
            self.assertEqual(db.get(PatientModel, second.id).phone, '(11) 5555-0000')
