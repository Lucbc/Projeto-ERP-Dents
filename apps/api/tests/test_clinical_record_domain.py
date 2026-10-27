from dataclasses import FrozenInstanceError, replace
from datetime import datetime, timedelta, timezone
from unittest import TestCase
from uuid import uuid4

from src.core.domain.clinical_record import (
    ClinicalContext, append_addendum, create_draft, finalize, require_clinical_permission, save_draft,
)
from src.core.domain.entities import Appointment, AppointmentStatus, User, UserRole
from src.core.domain.exceptions import ConflictError, ForbiddenError, ValidationError


class ClinicalRecordDomainTests(TestCase):
    def setUp(self):
        self.now = datetime(2030, 1, 7, 13, tzinfo=timezone.utc)
        self.actor = User(version=1, id=uuid4(), name='Dentista Ficticio', email='fiction@example.com',
                          role=UserRole.dentist, dentist_id=uuid4(), password_hash='', is_active=True,
                          created_at=self.now, updated_at=self.now)
        self.permissions = {'clinical_records': {'view': True, 'create': True, 'update': True, 'delete': False}}
        self.visit = Appointment(version=1, id=uuid4(), patient_id=uuid4(), dentist_id=self.actor.dentist_id,
                                 start_at=self.now, end_at=self.now + timedelta(hours=1),
                                 status=AppointmentStatus.confirmed, notes='Agenda ficticia',
                                 created_at=self.now, updated_at=self.now)
        self.context = ClinicalContext('Alergia ficticia', 'Historico ficticio')
        self.draft = create_draft(uuid4(), self.visit, self.actor, self.permissions, 'Texto original\n', self.now)

    def completed(self):
        return finalize(self.draft, self.actor, self.permissions, 1, self.context, self.now)

    def test_creation_uses_server_actor_and_visit_without_mutating_them(self):
        self.assertEqual((self.draft.author_id, self.draft.dentist_id, self.draft.patient_id, self.draft.appointment_id),
                         (self.actor.id, self.actor.dentist_id, self.visit.patient_id, self.visit.id))
        self.assertEqual(self.visit.version, 1)
        self.assertEqual(self.visit.status, AppointmentStatus.confirmed)
        self.assertEqual(self.visit.notes, 'Agenda ficticia')
        self.assertEqual(self.draft.text, 'Texto original\n')

    def test_read_is_explicit_for_every_role_including_admin(self):
        for role in UserRole:
            actor = replace(self.actor, role=role)
            require_clinical_permission(actor, self.permissions, 'view')
            for permissions in ({}, {'clinical_records': {'view': False}}, {'clinical_records': {'view': 'true'}}):
                with self.subTest(role=role, permissions=permissions), self.assertRaises(ForbiddenError):
                    require_clinical_permission(actor, permissions, 'view')

    def test_read_does_not_grant_write_and_write_requires_read(self):
        for grants in ({'view': True}, {'create': True, 'update': True}):
            for action in ('create', 'update'):
                with self.subTest(grants=grants, action=action), self.assertRaises(ForbiddenError):
                    require_clinical_permission(self.actor, {'clinical_records': grants}, action)

    def test_non_dentist_and_unlinked_dentist_cannot_write_even_with_grants(self):
        actors = [replace(self.actor, role=role) for role in UserRole if role != UserRole.dentist]
        actors += [replace(self.actor, dentist_id=None), replace(self.actor, is_active=False)]
        for actor in actors:
            with self.subTest(role=actor.role, dentist=actor.dentist_id), self.assertRaises(ForbiddenError):
                create_draft(uuid4(), self.visit, actor, self.permissions, '', self.now)
        with self.assertRaises(ForbiddenError):
            require_clinical_permission(replace(self.actor, is_active=False), self.permissions, 'view')

    def test_cannot_create_for_another_dentist(self):
        with self.assertRaises(ForbiddenError):
            create_draft(uuid4(), replace(self.visit, dentist_id=uuid4()), self.actor, self.permissions, '', self.now)

    def test_other_user_with_same_dentist_or_changed_link_cannot_edit_finalize_or_add(self):
        for actor in (replace(self.actor, id=uuid4()), replace(self.actor, dentist_id=uuid4())):
            for operation in (
                lambda: save_draft(self.draft, actor, self.permissions, 1, 'Changed', self.now),
                lambda: finalize(self.draft, actor, self.permissions, 1, self.context, self.now),
                lambda: append_addendum(self.completed(), actor, self.permissions, 2, uuid4(), 'Text', 'Reason', self.now),
            ):
                with self.assertRaises(ForbiddenError):
                    operation()

    def test_revoked_permission_blocks_each_transition(self):
        for operation in (
            lambda: save_draft(self.draft, self.actor, {}, 1, 'Changed', self.now),
            lambda: finalize(self.draft, self.actor, {}, 1, self.context, self.now),
            lambda: append_addendum(self.completed(), self.actor, {}, 2, uuid4(), 'Text', 'Reason', self.now),
        ):
            with self.assertRaises(ForbiddenError):
                operation()

    def test_empty_draft_can_be_saved_but_not_finalized(self):
        empty = save_draft(self.draft, self.actor, self.permissions, 1, ' \n ', self.now)
        self.assertEqual(empty.version, 2)
        with self.assertRaises(ValidationError):
            finalize(empty, self.actor, self.permissions, 2, self.context, self.now)
        self.assertEqual(self.draft.version, 1)

    def test_stale_and_invalid_versions_are_controlled(self):
        current = save_draft(self.draft, self.actor, self.permissions, 1, 'Novo', self.now)
        for operation in (
            lambda: save_draft(current, self.actor, self.permissions, 1, 'Antigo', self.now),
            lambda: finalize(current, self.actor, self.permissions, 1, self.context, self.now),
            lambda: append_addendum(self.completed(), self.actor, self.permissions, 1, uuid4(), 'Text', 'Reason', self.now),
        ):
            with self.assertRaises(ConflictError):
                operation()
        for version in (True, '1', None, 0, -1):
            with self.subTest(version=version), self.assertRaises(ValidationError):
                save_draft(self.draft, self.actor, self.permissions, version, 'Text', self.now)

    def test_final_text_context_and_author_are_immutable(self):
        record = self.completed()
        with self.assertRaises(FrozenInstanceError):
            record.text = 'Changed'
        with self.assertRaises(FrozenInstanceError):
            record.context.allergies = 'Changed'
        renamed = replace(self.actor, name='Novo nome ficticio')
        corrected = append_addendum(record, renamed, self.permissions, 2, uuid4(), ' Adendo\n', 'Motivo', self.now)
        self.assertEqual(corrected.text, self.draft.text)
        self.assertEqual(corrected.author_name, self.actor.name)
        self.assertEqual(corrected.context, self.context)
        self.assertEqual(corrected.finalized_at, record.finalized_at)
        self.assertEqual(corrected.addenda[0].author_name, renamed.name)
        self.assertEqual(corrected.addenda[0].text, ' Adendo\n')
        self.assertEqual(record.addenda, ())

    def test_finalized_record_cannot_be_rewritten_or_refinalized(self):
        record = self.completed()
        with self.assertRaises(ConflictError):
            save_draft(record, self.actor, self.permissions, 2, 'Rewrite', self.now)
        with self.assertRaises(ConflictError):
            finalize(record, self.actor, self.permissions, 2, self.context, self.now)
        with self.assertRaises(ForbiddenError):
            require_clinical_permission(self.actor, {'clinical_records': {'view': True, 'delete': True}}, 'delete')

    def test_addenda_require_finalization_text_reason_and_unique_identity(self):
        with self.assertRaises(ConflictError):
            append_addendum(self.draft, self.actor, self.permissions, 1, uuid4(), 'Text', 'Reason', self.now)
        record = self.completed()
        for text, reason in (('', 'Reason'), ('Text', '  '), (None, 'Reason'), ('Text', None)):
            with self.subTest(text=text, reason=reason), self.assertRaises(ValidationError):
                append_addendum(record, self.actor, self.permissions, 2, uuid4(), text, reason, self.now)
        key = uuid4()
        first = append_addendum(record, self.actor, self.permissions, 2, key, 'First', 'Reason', self.now)
        with self.assertRaises(ConflictError):
            append_addendum(first, self.actor, self.permissions, 3, key, 'Changed', 'Reason', self.now)
        second = append_addendum(first, self.actor, self.permissions, 3, uuid4(), 'Second', 'Reason', self.now)
        self.assertEqual([a.text for a in second.addenda], ['First', 'Second'])
        self.assertEqual(second.version, 4)

    def test_server_instants_require_timezone_and_preserve_precision(self):
        offset = self.now.astimezone(timezone(timedelta(hours=-3))).replace(microsecond=123456)
        saved = save_draft(self.draft, self.actor, self.permissions, 1, 'Text', offset)
        self.assertEqual(saved.updated_at, self.now.replace(microsecond=123456))
        for now in (self.now.replace(tzinfo=None), self.now-timedelta(seconds=1), None):
            with self.subTest(now=now), self.assertRaises(ValidationError):
                save_draft(self.draft, self.actor, self.permissions, 1, 'Text', now)

    def test_finalization_rejects_invalid_context_without_altering_draft(self):
        for context in (None, {}, ClinicalContext([], None)):
            with self.subTest(context=context), self.assertRaises(ValidationError):
                finalize(self.draft, self.actor, self.permissions, 1, context, self.now)
        self.assertIsNone(self.draft.finalized_at)
        self.assertIsNone(self.draft.context)
