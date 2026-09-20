"""Version procedure edits without changing catalog or historical values."""
from alembic import op
import sqlalchemy as sa

revision = '0017_procedure_version'
down_revision = '0016_dentist_version'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('procedures', sa.Column('version', sa.BigInteger(), server_default='1', nullable=False))
    op.create_check_constraint('ck_procedures_positive_version', 'procedures', 'version > 0')


def downgrade():
    op.drop_constraint('ck_procedures_positive_version', 'procedures')
    op.drop_column('procedures', 'version')
