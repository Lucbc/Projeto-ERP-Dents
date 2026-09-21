"""Version specialty edits, preserving the catalog and dentist text fields."""
from alembic import op
import sqlalchemy as sa

revision = '0018_specialty_version'
down_revision = '0017_procedure_version'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('specialties', sa.Column('version', sa.BigInteger(), server_default='1', nullable=False))
    op.create_check_constraint('ck_specialties_positive_version', 'specialties', 'version > 0')


def downgrade():
    op.drop_constraint('ck_specialties_positive_version', 'specialties')
    op.drop_column('specialties', 'version')
