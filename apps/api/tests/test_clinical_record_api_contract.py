import unittest
from uuid import uuid4

from pydantic import ValidationError

from src.api.schemas.clinical_records import ClinicalDraftRequest, ClinicalFinalizeRequest, ClinicalSaveRequest
from src.core.domain.entities import UserRole
from src.core.permissions import can_access, get_default_permissions, normalize_permissions


class ClinicalApiContractTests(unittest.TestCase):
    def test_no_default_clinical_access_even_for_admin(self):
        for role in UserRole:
            for action in ('view', 'create', 'update', 'delete'):
                self.assertFalse(can_access(role, get_default_permissions(role), 'clinical_records', action))
        self.assertTrue(can_access(UserRole.admin, {}, 'users', 'delete'))

    def test_explicit_read_for_any_role_but_writes_only_for_dentist(self):
        raw = {'clinical_records': dict.fromkeys(('view', 'create', 'update', 'delete'), True),
               'users': {'view': False}}
        for role in UserRole:
            effective = normalize_permissions(role, raw)
            self.assertTrue(can_access(role, effective, 'clinical_records', 'view'))
            self.assertFalse(can_access(role, effective, 'clinical_records', 'delete'))
            self.assertEqual(effective['clinical_records']['update'], role == UserRole.dentist)
        self.assertTrue(normalize_permissions(UserRole.admin, raw)['users']['view'])
        raw['clinical_records']['view'] = False
        self.assertFalse(normalize_permissions(UserRole.dentist, raw)['clinical_records']['create'])

    def test_payload_cannot_supply_identity_context_timestamps_or_final_text(self):
        base = {'key': str(uuid4()), 'text': 'Fictitious draft'}
        for field in ('author_id', 'patient_id', 'dentist_id', 'context', 'created_at', 'finalized_at'):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                ClinicalDraftRequest(**base, **{field: 'forged'})
        with self.assertRaises(ValidationError):
            ClinicalFinalizeRequest(**base, version=1)

    def test_version_and_text_are_strict_and_bounded(self):
        for version in (True, '1', 1.2, 0, -1, None, 2**63 - 1):
            with self.subTest(version=version), self.assertRaises(ValidationError):
                ClinicalSaveRequest(key=uuid4(), version=version, text='')
        for text in (None, 12, 'x' * 50001):
            with self.assertRaises(ValidationError):
                ClinicalDraftRequest(key=uuid4(), text=text)
        self.assertEqual(ClinicalDraftRequest(key=uuid4(), text='').text, '')
