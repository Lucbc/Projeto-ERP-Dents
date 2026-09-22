"""Version financial writes without changing payments or generation receipts."""
from alembic import op
import sqlalchemy as sa

revision = '0019_financial_version'
down_revision = '0018_specialty_version'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('financial_entries', sa.Column('version', sa.BigInteger(), server_default='1', nullable=False))
    op.create_check_constraint('ck_financial_positive_version', 'financial_entries', 'version > 0')


def downgrade():
    op.drop_constraint('ck_financial_positive_version', 'financial_entries')
    op.drop_column('financial_entries', 'version')
