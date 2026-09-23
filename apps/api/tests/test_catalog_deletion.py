"""Versioned catalog deletion with independent PostgreSQL connections."""
import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.orm import Session
import test_appointment_concurrency as fixture
from src.adapters.db.repositories.procedure_repository import SqlAlchemyProcedureRepository
from src.adapters.db.repositories.specialty_repository import SqlAlchemySpecialtyRepository
from src.core.domain.exceptions import ConflictError, ValidationError


@unittest.skipUnless(os.getenv('RUN_HOMOLOG_TESTS') == '1', 'Homologation opt-in required')
class CatalogDeletionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixture.AppointmentConcurrencyTests()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.engine = self.fixture.engine

    def test_old_version_invalid_version_absent_and_current_deletion(self):
        for repository in (SqlAlchemyProcedureRepository, SqlAlchemySpecialtyRepository):
            with Session(self.engine) as db:
                repo = repository(db)
                item = repo.create({'name':'Fictitious catalog item'})
                repo.update(item.id, {'version':1, 'name':'Fictitious revised item'})
                for version in (None, 0, -1, True, '1'):
                    with self.assertRaises(ValidationError): repo.delete(item.id, version)
                with self.assertRaises(ConflictError) as error: repo.delete(item.id, 1)
                self.assertEqual(error.exception.code, 'stale_version')
                self.assertEqual(repo.get(item.id).name, 'Fictitious revised item')
                self.assertTrue(repo.delete(item.id, 2))
                self.assertFalse(repo.delete(item.id, 2))

    def race(self, repository, delete_both):
        with Session(self.engine) as db: item = repository(db).create({'name':'Fictitious race '+uuid4().hex})
        barrier = Barrier(2, timeout=15)
        def worker(index):
            with Session(self.engine) as db:
                repo = repository(db)
                # Both sessions load the old row before either writes.
                self.assertEqual(repo.get(item.id).version, 1)
                barrier.wait()
                try:
                    result = repo.delete(item.id, 1) if delete_both or index else repo.update(item.id, {'version':1, 'name':'Fictitious winner'})
                    return bool(result)
                except ConflictError:
                    return False
        with ThreadPoolExecutor(max_workers=2) as pool: result = list(pool.map(worker, range(2)))
        self.assertEqual(sum(result), 1)

    def test_edit_against_delete_has_one_winner(self):
        for repository in (SqlAlchemyProcedureRepository, SqlAlchemySpecialtyRepository): self.race(repository, False)

    def test_two_deletions_have_one_winner(self):
        for repository in (SqlAlchemyProcedureRepository, SqlAlchemySpecialtyRepository): self.race(repository, True)

    def test_new_appointment_link_blocks_deletion_and_rolls_back(self):
        appointment = self.fixture.insert(self.fixture.data())
        with Session(self.engine) as db:
            repo = SqlAlchemyProcedureRepository(db)
            item = repo.create({'name':'Fictitious linked procedure'})
            self.assertEqual(repo.get(item.id).version, 1)
            with self.engine.begin() as other:
                other.execute(text('INSERT INTO appointment_procedures(appointment_id,procedure_id,created_at) VALUES(:appointment,:procedure,now())'),
                              {'appointment':appointment, 'procedure':item.id})
            with self.assertRaises(ConflictError) as error: repo.delete(item.id, 1)
            self.assertEqual(error.exception.code, 'linked_record')
            self.assertEqual(repo.get(item.id).version, 1)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM appointment_procedures WHERE procedure_id=:id'), {'id':item.id}), 1)

    def test_specialty_deletion_does_not_change_dentist_text(self):
        with Session(self.engine) as db:
            repo = SqlAlchemySpecialtyRepository(db)
            item = repo.create({'name':'Fictitious textual specialty'})
            db.execute(text('UPDATE dentists SET specialty=:name'), {'name':item.name}); db.commit()
            repo.delete(item.id, 1)
            self.assertEqual(db.scalar(text('SELECT count(*) FROM dentists WHERE specialty=:name'), {'name':item.name}), 2)
