"""Canonical state precondition, not an authorization credential."""
from datetime import timezone
import hashlib
import json


def exams_fingerprint(patient_id, exams):
    rows = [[str(exam.id), exam.original_filename, exam.stored_filename,
             exam.mime_type, exam.size_bytes,
             exam.uploaded_at.astimezone(timezone.utc).isoformat(), exam.notes]
            for exam in exams]
    rows.sort(key=lambda row: row[0])
    value = json.dumps([str(patient_id), rows], ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(value.encode('utf-8')).hexdigest()
