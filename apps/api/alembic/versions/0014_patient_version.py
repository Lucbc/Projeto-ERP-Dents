"""Version patient edits without changing existing business fields."""
from alembic import op
import sqlalchemy as sa

revision = '0014_patient_version'
down_revision = '0013_financial_generation'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('patients', sa.Column('version', sa.BigInteger(), server_default='1', nullable=False))
    op.create_check_constraint('ck_patients_positive_version', 'patients', 'version > 0')


def downgrade():
    op.drop_constraint('ck_patients_positive_version', 'patients')
    op.drop_column('patients', 'version')
