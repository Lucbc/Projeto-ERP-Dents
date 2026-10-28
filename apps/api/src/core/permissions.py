from __future__ import annotations

from copy import deepcopy
from typing import Literal, TypeAlias

from src.core.domain.entities import UserRole

PermissionAction: TypeAlias = Literal["view", "create", "update", "delete"]
PermissionResource: TypeAlias = Literal[
    "dashboard",
    "patients",
    "dentists",
    "specialties",
    "procedures",
    "appointments",
    "calendar",
    "exams",
    "users",
    "permissions",
    "consultations",
    "financial",
    "financial_reversals",
    "clinical_records",
]
PermissionMatrix: TypeAlias = dict[str, dict[str, bool]]

PERMISSION_ACTIONS: tuple[PermissionAction, ...] = ("view", "create", "update", "delete")
PERMISSION_RESOURCES: tuple[PermissionResource, ...] = (
    "dashboard",
    "patients",
    "dentists",
    "specialties",
    "procedures",
    "appointments",
    "calendar",
    "exams",
    "users",
    "permissions",
    "consultations",
    "financial",
    "financial_reversals",
    "clinical_records",
)


def _allow_all() -> dict[str, bool]:
    return {action: True for action in PERMISSION_ACTIONS}


def _allow_view_only() -> dict[str, bool]:
    return {"view": True, "create": False, "update": False, "delete": False}


def _deny_all() -> dict[str, bool]:
    return {action: False for action in PERMISSION_ACTIONS}


DEFAULT_ROLE_PERMISSIONS: dict[UserRole, PermissionMatrix] = {
    UserRole.admin: {resource: _allow_all() for resource in PERMISSION_RESOURCES},
    UserRole.coordinator: {
        "dashboard": _allow_view_only(),
        "patients": _allow_all(),
        "dentists": _allow_all(),
        "specialties": _allow_all(),
        "procedures": _allow_all(),
        "appointments": _allow_all(),
        "calendar": _allow_view_only(),
        "exams": {"view": True, "create": True, "update": False, "delete": True},
        "users": _deny_all(),
        "permissions": _deny_all(),
        "consultations": _allow_view_only(),
        "financial": _allow_all(),
        "financial_reversals": _deny_all(),
    },
    UserRole.dentist: {
        "dashboard": _allow_view_only(),
        "patients": {"view": True, "create": False, "update": True, "delete": False},
        "dentists": _allow_view_only(),
        "specialties": _allow_view_only(),
        "procedures": _allow_view_only(),
        "appointments": {"view": True, "create": False, "update": True, "delete": False},
        "calendar": _allow_view_only(),
        "exams": {"view": True, "create": True, "update": False, "delete": False},
        "users": _deny_all(),
        "permissions": _deny_all(),
        "consultations": _allow_view_only(),
        "financial": _allow_view_only(),
        "financial_reversals": _deny_all(),
    },
    UserRole.reception: {
        "dashboard": _allow_view_only(),
        "patients": {"view": True, "create": True, "update": True, "delete": False},
        "dentists": _allow_view_only(),
        "specialties": _allow_view_only(),
        "procedures": _allow_view_only(),
        "appointments": _allow_all(),
        "calendar": _allow_view_only(),
        "exams": {"view": True, "create": True, "update": False, "delete": False},
        "users": _deny_all(),
        "permissions": _deny_all(),
        "consultations": _deny_all(),
        "financial": {"view": True, "create": True, "update": True, "delete": False},
        "financial_reversals": _deny_all(),
    },
}

# Clinical content always requires an explicit grant, including administrators.
for _matrix in DEFAULT_ROLE_PERMISSIONS.values():
    _matrix['clinical_records'] = _deny_all()


def get_default_permissions(role: UserRole) -> PermissionMatrix:
    return deepcopy(DEFAULT_ROLE_PERMISSIONS[role])


def normalize_permissions(role: UserRole, raw_permissions: dict | None) -> PermissionMatrix:
    defaults = get_default_permissions(role)
    if raw_permissions is None:
        return defaults

    normalized = get_default_permissions(role)
    for resource in PERMISSION_RESOURCES:
        current_actions = raw_permissions.get(resource, {})
        for action in PERMISSION_ACTIONS:
            normalized[resource][action] = bool(current_actions.get(action, defaults[resource][action]))
        if role == UserRole.admin and resource != 'clinical_records':
            normalized[resource] = _allow_all()
    clinical = normalized['clinical_records']
    clinical['delete'] = False
    for action in ('create', 'update'):
        clinical[action] = clinical[action] and clinical['view'] and role == UserRole.dentist
    return normalized


def can_access(
    role: UserRole,
    permissions: PermissionMatrix,
    resource: PermissionResource,
    action: PermissionAction,
) -> bool:
    if resource == 'clinical_records':
        grants = permissions.get(resource, {})
        return bool(grants.get('view') is True and grants.get(action) is True
                    and (action == 'view' or (action in ('create', 'update') and role == UserRole.dentist)))
    if role == UserRole.admin:
        return True
    return bool(permissions.get(resource, {}).get(action, False))
