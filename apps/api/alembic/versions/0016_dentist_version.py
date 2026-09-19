"""Version dentist edits while preserving existing business fields and schedules."""
from alembic import op
import sqlalchemy as sa

revision = '0016_dentist_version'
down_revision = '0015_appointment_version'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('dentists', sa.Column('version', sa.BigInteger(), server_default='1', nullable=False))
    op.create_check_constraint('ck_dentists_positive_version', 'dentists', 'version > 0')


def downgrade():
    op.drop_constraint('ck_dentists_positive_version', 'dentists')
    op.drop_column('dentists', 'version')
