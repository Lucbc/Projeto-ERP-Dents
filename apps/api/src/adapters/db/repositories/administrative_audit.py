"""Write metadata only, inside the mutation's existing transaction; never commit here."""
import json
from uuid import uuid4

from sqlalchemy import text
from src.core.permissions import PERMISSION_ACTIONS, PERMISSION_RESOURCES, normalize_permissions

USER_FIELDS = ('name', 'email', 'role', 'dentist_id', 'is_active')


def _append(session, *, actor_id, action, target_user_id=None, target_role=None,
            before_version=None, after_version=None, fields=(), changes=()):
    session.execute(text('''INSERT INTO administrative_audit
        (id,actor_id,action,target_user_id,target_role,before_version,after_version,changed_fields,permission_changes)
        VALUES (:id,:actor,:action,:user,:role,:before,:after,:fields,CAST(:changes AS jsonb))'''),
        dict(id=uuid4(), actor=actor_id, action=action, user=target_user_id, role=target_role,
             before=before_version, after=after_version, fields=list(fields), changes=json.dumps(list(changes))))


def record_user_event(session, actor_id, action, *, before=None, after=None):
    target = after if after is not None else before
    # Deliberately omit values and password/hash fields, including in reset events.
    fields = [field for field in USER_FIELDS if after is not None and
              (before is None or getattr(before, field) != getattr(after, field))]
    _append(session, actor_id=actor_id, action=action, target_user_id=target.id,
            before_version=before.version if before else None,
            after_version=after.version if after else None, fields=fields)


def record_permission_event(session, actor_id, role, before, after):
    old = normalize_permissions(role, before.permissions if before else None)
    new = normalize_permissions(role, after.permissions)
    changes = [dict(resource=resource, action=action, before=old[resource][action], after=new[resource][action])
               for resource in PERMISSION_RESOURCES for action in PERMISSION_ACTIONS
               if old[resource][action] != new[resource][action]]
    _append(session, actor_id=actor_id, action='permissions.updated', target_role=role.value,
            before_version=before.version if before else 0, after_version=after.version, changes=changes)
