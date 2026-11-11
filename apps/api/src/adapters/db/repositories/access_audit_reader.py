"""Bounded metadata reads, authorized after acquiring the administration lock."""
import base64
import json
from datetime import datetime
from uuid import UUID

from sqlalchemy import text

from src.adapters.db.repositories.user_repository import SqlAlchemyUserRepository
from src.core.domain.exceptions import ForbiddenError, UnauthorizedError, ValidationError
from src.core.permissions import can_access, normalize_permissions

ACTIONS = ('clinical.record_read', 'clinical.appointment_read', 'clinical.patient_list', 'exam.download_prepared')


def decode_cursor(value):
    try:
        if len(value) > 512:
            raise ValueError()
        raw = json.loads(base64.b64decode(value, altchars=b'-_', validate=True))
        if not isinstance(raw, list) or len(raw) != 2:
            raise ValueError()
        instant, identifier = datetime.fromisoformat(raw[0]), UUID(raw[1])
        if instant.tzinfo is None or instant.utcoffset() is None:
            raise ValueError()
        return instant, identifier
    except (ValueError, TypeError, KeyError, UnicodeError):
        raise ValidationError('Cursor de auditoria inválido.') from None


class AccessAuditReader:
    def __init__(self, session):
        self.session = session

    def list(self, *, actor_id, session_id, limit=25, cursor=None, action=None,
             author_id=None, patient_id=None, target_id=None, since=None, until=None):
        users = SqlAlchemyUserRepository(self.session)
        with users.administration_lock():
            actor = users.get(actor_id)
            if actor is None or not actor.is_active or not users.session_active(session_id, actor_id):
                raise UnauthorizedError('Sessão encerrada. Entre novamente.')
            raw = self.session.scalar(text('SELECT permissions FROM role_permissions WHERE role=:role'),
                                      {'role': actor.role.value})
            if not can_access(actor.role, normalize_permissions(actor.role, raw), 'access_audit', 'view'):
                raise ForbiddenError('Sem permissão para consultar o histórico de acessos.')
            if type(limit) is not int or not 1 <= limit <= 100 or (action is not None and action not in ACTIONS):
                raise ValidationError('Filtro de auditoria inválido.')
            for instant in (since, until):
                if instant is not None and (not isinstance(instant, datetime) or instant.utcoffset() is None):
                    raise ValidationError('Informe data e hora com fuso explícito.')
            if since is not None and until is not None and since >= until:
                raise ValidationError('O fim do período deve ser posterior ao início.')
            clauses, params = [], {'limit': limit + 1}
            for column, value in (('action', action), ('actor_id', author_id),
                                  ('patient_id', patient_id), ('target_id', target_id)):
                if value is not None:
                    if column in ('actor_id', 'patient_id', 'target_id'):
                        try:
                            value = UUID(str(value))
                        except ValueError:
                            raise ValidationError('Identificador de auditoria inválido.') from None
                    clauses.append(column + '=:' + column)
                    params[column] = value
            for name, operator, value in (('since', '>=', since), ('until', '<', until)):
                if value is not None:
                    clauses.append('occurred_at ' + operator + ' :' + name)
                    params[name] = value
            if cursor is not None:
                params['cursor_time'], params['cursor_id'] = decode_cursor(cursor)
                clauses.append('(occurred_at,id) < (:cursor_time,:cursor_id)')
            where = ' WHERE ' + ' AND '.join(clauses) if clauses else ''
            rows = [dict(row) for row in self.session.execute(text('''SELECT id,occurred_at,actor_id,action,
                patient_id,target_id,record_ids,record_versions,returned_count,page_limit,page_offset
                FROM access_audit''' + where + ' ORDER BY occurred_at DESC,id DESC LIMIT :limit'), params).mappings()]
            more = len(rows) > limit
            rows = rows[:limit]
            next_cursor = None
            if more:
                last = rows[-1]
                next_cursor = base64.urlsafe_b64encode(json.dumps([
                    last['occurred_at'].isoformat(), str(last['id'])]).encode()).decode()
            return {'items': rows, 'next_cursor': next_cursor}
