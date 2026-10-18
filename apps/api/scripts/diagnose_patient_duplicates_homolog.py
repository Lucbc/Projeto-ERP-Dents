"""Historical duplicate-entry diagnosis, not a regression contract accepting duplicates.

Run explicitly with RUN_HOMOLOG_TESTS=1 in erp-dents-homolog only.
Uses the existing private-schema fixture; never prints identifiers or records.
Historical reproduction for v0.1.6 and earlier. After the CPF guard, rejection
is expected; use test_patient_cpf_guard_db.py for current acceptance instead.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import os
from pathlib import Path
import sys
import threading

from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
from test_appointment_concurrency import AppointmentConcurrencyTests
from src.adapters.db.repositories.patient_repository import SqlAlchemyPatientRepository
from src.core.use_cases.patient_use_cases import PatientUseCases


def main():
    if os.environ.get('RUN_HOMOLOG_TESTS') != '1':
        raise RuntimeError('Explicit homologation opt-in required')
    fixture = AppointmentConcurrencyTests()
    try:
        fixture.setUp()  # Requires erp_dents_homolog and migrates a unique schema.
        with Session(fixture.engine) as db:
            repo = SqlAlchemyPatientRepository(db)
            use_cases = PatientUseCases(repo)
            first = use_cases.create(dict(full_name='Duplicate Diagnosis Fictitious A', cpf='123.456.789-01'))
            second = use_cases.create(dict(full_name='Duplicate Diagnosis Fictitious B', cpf='12345678901'))
            assert repo.list('12345678901', 100, 0)[1] == 2
            print('OBSERVED: formatted and unformatted equivalent CPF accepted twice')
            third = use_cases.create(dict(full_name='Duplicate Diagnosis Fictitious C'))
            use_cases.update(third.id, dict(version=third.version, cpf='123.456.789-01'))
            assert repo.list('12345678901', 100, 0)[1] == 3
            assert use_cases.get(first.id).version == first.version
            assert use_cases.get(second.id).version == second.version
            print('OBSERVED: editing a third record to the same CPF accepted; others preserved')
            for birth in (date(1990, 1, 1), date(2000, 1, 1)):
                use_cases.create(dict(full_name='Same Name Fictitious', birth_date=birth))
            assert repo.list('Same Name Fictitious', 100, 0)[1] == 2
            print('OBSERVED: same name with different birth dates and absent CPF accepted')
        barrier = threading.Barrier(2, timeout=15)

        def create_concurrently(index):
            with Session(fixture.engine) as db:
                use_cases = PatientUseCases(SqlAlchemyPatientRepository(db))
                barrier.wait()
                return use_cases.create(dict(full_name='Concurrent Fictitious ' + str(index), cpf='98765432109')).id

        with ThreadPoolExecutor(max_workers=2) as pool:
            ids = list(pool.map(create_concurrently, (1, 2)))
        assert len(set(ids)) == 2
        with Session(fixture.engine) as db:
            assert SqlAlchemyPatientRepository(db).list('98765432109', 100, 0)[1] == 2
        print('OBSERVED: simultaneous creation with the same CPF accepted twice')
    finally:
        fixture.doCleanups()
    print('PASS: diagnosis complete; private schema removed; no application changes')


if __name__ == '__main__':
    main()
