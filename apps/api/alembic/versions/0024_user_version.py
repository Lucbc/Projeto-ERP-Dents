"""Version users without rewriting identities, credentials or sessions."""
from alembic import op
import sqlalchemy as sa

revision = '0024_user_version'
down_revision = '0023_permission_version'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('version', sa.BigInteger(), nullable=False, server_default='1'))
    op.create_check_constraint('ck_users_version_positive', 'users', 'version > 0')


def downgrade():
    op.drop_constraint('ck_users_version_positive', 'users', type_='check')
    op.drop_column('users', 'version')
