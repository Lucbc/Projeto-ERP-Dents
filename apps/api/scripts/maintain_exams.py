"""Recoverable maintenance. Output contains aggregate counts, never patient data."""
import argparse
import json
from uuid import UUID

from src.adapters.db.database import SessionLocal
from src.adapters.db.exam_maintenance import maintain_exams, exam_storage_lock, restore_quarantined
from src.adapters.storage.filesystem_exam_storage import FileSystemExamStorage


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--restore-patient', type=UUID)
    parser.add_argument('--restore-file')
    args = parser.parse_args()
    if bool(args.restore_patient) != bool(args.restore_file):
        parser.error('Restore requires both patient ID and stored filename')
    with SessionLocal() as db:
        storage = FileSystemExamStorage()
        if args.restore_patient:
            with exam_storage_lock(db.get_bind()):
                restore_quarantined(storage, args.restore_patient, args.restore_file)
            print('File restored without replacing existing data. Metadata requires separate recovery.')
        else:
            report = maintain_exams(db, storage)
            print(json.dumps(report))
            if report['pending_failures'] or report['missing_referenced'] or report['unsafe_entries']:
                raise SystemExit(1)


if __name__ == '__main__':
    main()
