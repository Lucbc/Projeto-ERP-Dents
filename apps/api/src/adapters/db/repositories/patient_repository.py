from __future__ import annotations

from sqlalchemy import func, literal_column, or_, select, text, update
from sqlalchemy.orm import Session

from src.adapters.db.models.models import PatientModel, ExamModel
from src.adapters.db.exam_cleanup import queue_exam_file
from sqlalchemy.exc import IntegrityError
from src.core.domain.exceptions import ConflictError, ValidationError, ForbiddenError
from src.adapters.db.repositories.patient_deletion import exams_fingerprint
import re
import unicodedata
import hashlib
import json
from src.core.domain.entities import Patient
from src.core.domain.cpf import cpf_digits, same_cpf, validate_cpf
from src.core.domain.patient_dates import validate_birth_date
from src.core.ports.repositories import PatientRepository


class SqlAlchemyPatientRepository(PatientRepository):
    def __init__(self, session: Session) -> None:
        self.session = session

    @staticmethod
    def _cpf_key(value):
        return cpf_digits(value)

    def _guard_cpf(self, key, patient_id=None):
        if key is None:
            return
        # All application writers acquire this transaction lock BEFORE checking.
        # The separate SELECT obtains a fresh READ COMMITTED snapshot after waiting.
        self.session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended("
            "current_schema() || ' patient-cpf ' || :cpf, 0))"), {'cpf': key})
        stmt = select(PatientModel.id).where(
            PatientModel.cpf.op('~')(r'^[0-9.\s-]+$'),
            func.regexp_replace(PatientModel.cpf, '[^0-9]', '', 'g') == key)
        if patient_id is not None:
            stmt = stmt.where(PatientModel.id != patient_id)
        if self.session.scalar(stmt.limit(1)) is not None:
            raise ConflictError('Este CPF já está em outro cadastro, inclusive se inativo. '
                'Confira o cadastro existente ou corrija o CPF. Seu rascunho foi mantido.', code='duplicate_cpf')

    def duplicate_candidates(self, full_name, birth_date, cpf):
        predicates = []
        digits = re.sub(r'[^0-9]', '', cpf or '')
        cpf_match = None
        if len(digits) == 11 and re.fullmatch(r'[0-9.\s-]+', cpf or ''):
            cpf_match = (PatientModel.cpf.op('~')(r'^[0-9.\s-]+$')) & (
                func.regexp_replace(PatientModel.cpf, '[^0-9]', '', 'g') == digits)
            predicates.append(cpf_match)
        marks = '[\u0300-\u036f]'
        name = ' '.join(re.sub(marks, '', unicodedata.normalize('NFD', full_name or '')).split())
        if len(name) >= 2 and birth_date:
            stored_name = func.trim(func.regexp_replace(func.regexp_replace(
                func.normalize(PatientModel.full_name, literal_column('NFD')), marks, '', 'g'), r'\s+', ' ', 'g'))
            predicates.append((func.lower(stored_name) == func.lower(name)) & (PatientModel.birth_date == birth_date))
        if not predicates:
            return {'items': [], 'total': 0, 'checked': False}
        match = or_(*predicates)
        total = self.session.scalar(select(func.count()).select_from(PatientModel).where(match)) or 0
        # Select only the fields needed for review, including inactive records.
        rows = self.session.execute(select(PatientModel.id, PatientModel.full_name,
            PatientModel.birth_date, PatientModel.active,
            (cpf_match if cpf_match is not None else literal_column('false')).label('same_cpf'))
            .where(match).order_by(PatientModel.created_at.desc(), PatientModel.id.desc()).limit(10)).all()
        return {'items': [dict(id=row.id, full_name=row.full_name, birth_date=row.birth_date,
            active=row.active, same_cpf=bool(row.same_cpf)) for row in rows], 'total': int(total), 'checked': True}

    def list(self, search: str | None, limit: int, offset: int) -> tuple[list[Patient], int]:
        stmt = select(PatientModel)

        if search:
            term = search.strip()
            pattern = f"%{term}%"
            predicates = [
                PatientModel.full_name.ilike(pattern),
                PatientModel.preferred_name.ilike(pattern),
                PatientModel.cpf.ilike(pattern),
                PatientModel.rg.ilike(pattern),
                PatientModel.phone.ilike(pattern),
                PatientModel.email.ilike(pattern),
                PatientModel.insurance_provider.ilike(pattern),
            ]
            # Fold only names at query time; stored spelling remains untouched.
            # Match the same combining-mark range in Python and PostgreSQL NFD.
            marks = '[\u0300-\u036f]'
            folded = re.sub(marks, '', unicodedata.normalize('NFD', term))
            if folded.strip():
                for column in (PatientModel.full_name, PatientModel.preferred_name):
                    predicates.append(func.regexp_replace(
                        func.normalize(column, literal_column('NFD')), marks, '', 'g'
                    ).ilike(f'%{folded}%'))
            digits = re.sub(r'[^0-9]', '', term)
            if digits and re.fullmatch(r'[0-9.\s-]+', term):
                predicates.append(func.regexp_replace(PatientModel.cpf, '[^0-9]', '', 'g').like(f'%{digits}%'))
            if digits and re.fullmatch(r'[+0-9().\s-]+', term):
                predicates.append(func.regexp_replace(PatientModel.phone, '[^0-9]', '', 'g').like(f'%{digits}%'))
            stmt = stmt.where(or_(*predicates))

        total = self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
        items = self.session.scalars(
            stmt.order_by(PatientModel.created_at.desc(), PatientModel.id.desc()).limit(limit).offset(offset)
        ).all()
        return [self._to_entity(item) for item in items], int(total)

    def get(self, patient_id):
        item = self.session.get(PatientModel, patient_id)
        return self._to_entity(item) if item else None

    def create(self, data: dict, *, operation_key=None, actor_id=None, allow_replay=True) -> Patient:
        try:
            if operation_key is not None:
                if actor_id is None:
                    raise ValidationError('Usuário obrigatório para confirmar a tentativa.')
                digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False,
                    separators=(',', ':'), default=str).encode()).hexdigest()
                self.session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended("
                    "current_schema() || ' patient-create ' || :identity, 0))"),
                    {'identity': f'{actor_id}:{operation_key}'})
                receipt = self.session.execute(text('SELECT request_hash, patient_id '
                    'FROM patient_creation_operations WHERE actor_id=:actor AND key=:key'),
                    {'actor': actor_id, 'key': operation_key}).mappings().first()
                if receipt is not None:
                    if not allow_replay:
                        raise ForbiddenError('Sem permissão para consultar o resultado. Peça ajuda ao responsável.')
                    if receipt['request_hash'] != digest:
                        raise ConflictError('Esta tentativa já foi usada com outros dados. Confira o cadastro.',
                            code='idempotency_conflict')
                    item = self.get(receipt['patient_id'])
                    if item is None:
                        raise ConflictError('O cadastro desta tentativa foi excluído. Ele não será recriado.',
                            code='creation_deleted')
                    self.session.commit()
                    return item
            validate_birth_date(data.get('birth_date'))
            validate_cpf(data.get('cpf'))
            self._guard_cpf(self._cpf_key(data.get('cpf')))
            item = PatientModel(**data)
            self.session.add(item)
            if operation_key is not None:
                self.session.flush()
                self.session.execute(text('INSERT INTO patient_creation_operations '
                    '(actor_id, key, request_hash, patient_id) VALUES (:actor, :key, :hash, :patient)'),
                    {'actor': actor_id, 'key': operation_key, 'hash': digest, 'patient': item.id})
            self.session.commit()
            self.session.refresh(item)
            return self._to_entity(item)
        except Exception:
            self.session.rollback()
            raise

    def update(self, patient_id, data: dict):
        try:
            return self._update(patient_id, data)
        except Exception:
            self.session.rollback()
            raise

    def _update(self, patient_id, data: dict):
        version = data.get('version')
        if type(version) is not int or version < 1:
            raise ValidationError("Reabra o cadastro para obter a versão atual antes de salvar.")
        values = {}
        for key in [
            "full_name",
            "preferred_name",
            "birth_date",
            "cpf",
            "rg",
            "phone",
            "email",
            "address",
            "preferred_contact_method",
            "emergency_contact_name",
            "emergency_contact_phone",
            "insurance_provider",
            "insurance_plan",
            "insurance_member_id",
            "allergies",
            "medical_history",
            "notes",
            "active",
        ]:
            if key in data:
                values[key] = data[key]

        if 'cpf' in values or 'birth_date' in values:
            current = self.session.execute(select(PatientModel.cpf, PatientModel.birth_date, PatientModel.version)
                .where(PatientModel.id == patient_id)).first()
            # Let the versioned UPDATE below report missing/stale records.
            if current is not None and current.version == version:
                if 'birth_date' in values and values['birth_date'] != current.birth_date:
                    validate_birth_date(values['birth_date'])
                if 'cpf' in values:
                    if not same_cpf(values['cpf'], current.cpf):
                        validate_cpf(values['cpf'])
                    key = self._cpf_key(values['cpf'])
                    if key != self._cpf_key(current.cpf):
                        self._guard_cpf(key, patient_id)

        # The predicate and increment are one SQL statement, including no-op edits.
        item = self.session.scalar(update(PatientModel).where(
            PatientModel.id == patient_id, PatientModel.version == version
        ).values(**values, version=PatientModel.version + 1).returning(PatientModel),
            execution_options={'populate_existing': True})
        if item is None:
            exists = self.session.scalar(select(PatientModel.id).where(PatientModel.id == patient_id))
            self.session.rollback()
            if exists is None:
                return None
            raise ConflictError("Este paciente foi alterado por outra operação. Seu rascunho foi mantido. Carregue o cadastro atual antes de salvar novamente.")

        self.session.commit()
        self.session.refresh(item)
        return self._to_entity(item)

    def _deletion_state(self, patient_id, version, can_delete_exams):
        if type(version) is not int or version < 1:
            raise ValidationError("Recarregue o cadastro antes de confirmar a exclusão.")
        item = self.session.scalar(select(PatientModel).where(PatientModel.id == patient_id)
            .with_for_update().execution_options(populate_existing=True))
        if item is None:
            return None, []
        exams = list(self.session.scalars(select(ExamModel).where(ExamModel.patient_id == patient_id)
            .execution_options(populate_existing=True)))
        if exams and not can_delete_exams:
            raise ForbiddenError("Excluir este paciente exige também permissão para excluir exames.")
        if item.version != version:
            raise ConflictError("Este paciente foi alterado. Recarregue e confira antes de excluir.", code="stale_version")
        return item, exams

    def deletion_preview(self, patient_id, version, *, can_delete_exams=False):
        try:
            item, exams = self._deletion_state(patient_id, version, can_delete_exams)
            if item is None:
                return None
            return {"id": item.id, "full_name": item.full_name, "version": item.version,
                    "exam_count": len(exams), "exams_fingerprint": exams_fingerprint(patient_id, exams)}
        finally:
            # Never retain a lock while the user considers the confirmation.
            self.session.rollback()

    def delete(self, patient_id, version, expected_exams, *, can_delete_exams=False) -> bool:
        try:
            if not isinstance(expected_exams, str) or not re.fullmatch(r'[0-9a-f]{64}', expected_exams):
                raise ValidationError("Confira os exames antes de confirmar a exclusão.")
            item, exams = self._deletion_state(patient_id, version, can_delete_exams)
            if item is None:
                self.session.rollback()
                return False
            if exams_fingerprint(patient_id, exams) != expected_exams:
                raise ConflictError("Os exames deste paciente mudaram. Recarregue e confira antes de excluir.", code="stale_exams")
            for exam in exams:
                queue_exam_file(self.session, patient_id, exam.stored_filename)
            self.session.delete(item)
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            if getattr(error.orig, 'sqlstate', None) == '23503':
                raise ConflictError("Paciente possui registros vinculados. Inative o cadastro em vez de excluí-lo.", code="linked_record") from error
            raise
        except Exception:
            self.session.rollback()
            raise
        return True

    def _to_entity(self, model: PatientModel) -> Patient:
        return Patient(
            version=model.version,
            id=model.id,
            full_name=model.full_name,
            preferred_name=model.preferred_name,
            birth_date=model.birth_date,
            cpf=model.cpf,
            rg=model.rg,
            phone=model.phone,
            email=model.email,
            address=model.address,
            preferred_contact_method=model.preferred_contact_method,
            emergency_contact_name=model.emergency_contact_name,
            emergency_contact_phone=model.emergency_contact_phone,
            insurance_provider=model.insurance_provider,
            insurance_plan=model.insurance_plan,
            insurance_member_id=model.insurance_member_id,
            allergies=model.allergies,
            medical_history=model.medical_history,
            notes=model.notes,
            active=model.active,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
