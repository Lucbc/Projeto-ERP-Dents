"""Keep a dentist association until the account is explicitly reassigned.

Downgrade restores SET NULL and therefore removes this deletion protection.
Neither direction rewrites accounts, sessions, schedules or financial history.
"""
from alembic import op
import sqlalchemy as sa

revision = '0022_dentist_user_restrict'
down_revision = '0021_financial_references'
branch_labels = None
depends_on = None


def replace_fk(ondelete):
    constraints = [fk for fk in sa.inspect(op.get_bind()).get_foreign_keys('users')
                   if fk['constrained_columns'] == ['dentist_id']
                   and fk['referred_table'] == 'dentists' and fk['referred_columns'] == ['id']]
    if len(constraints) != 1 or not constraints[0]['name']:
        raise RuntimeError('Expected one named users-to-dentists foreign key; no changes applied.')
    name = constraints[0]['name']
    op.drop_constraint(name, 'users', type_='foreignkey')
    op.create_foreign_key(name, 'users', 'dentists', ['dentist_id'], ['id'], ondelete=ondelete)


def upgrade():
    replace_fk('RESTRICT')


def downgrade():
    replace_fk('SET NULL')
