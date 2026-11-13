"""Bound access-history sorting and action/target filters as history grows."""
from alembic import op

revision = '0031_access_audit_indexes'
down_revision = '0030_exam_access_audit'
branch_labels = None
depends_on = None


def upgrade():
    for name, columns in (
        ('time', 'occurred_at DESC,id DESC'),
        ('target', 'target_id,occurred_at DESC,id DESC'),
        ('action', 'action,occurred_at DESC,id DESC'),
    ):
        op.execute(f'CREATE INDEX ix_access_audit_{name} ON access_audit({columns})')


def downgrade():
    for name in ('action', 'target', 'time'):
        op.execute(f'DROP INDEX ix_access_audit_{name}')
