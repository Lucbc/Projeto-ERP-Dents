"""Version permission matrices without rewriting their JSON or timestamps."""
from alembic import op
import sqlalchemy as sa

revision = '0023_permission_version'
down_revision = '0022_dentist_user_restrict'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('role_permissions', sa.Column('version', sa.BigInteger(), nullable=False, server_default='1'))
    op.create_check_constraint('ck_role_permissions_version_positive', 'role_permissions', 'version > 0')


def downgrade():
    op.drop_constraint('ck_role_permissions_version_positive', 'role_permissions', type_='check')
    op.drop_column('role_permissions', 'version')
