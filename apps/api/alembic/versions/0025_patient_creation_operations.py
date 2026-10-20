"""Durable patient creation receipts; retain tombstones after patient/user deletion."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0025_patient_creation_operations'
down_revision = '0024_user_version'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('patient_creation_operations',
        sa.Column('actor_id', UUID(as_uuid=True), primary_key=True),
        sa.Column('key', UUID(as_uuid=True), primary_key=True),
        sa.Column('request_hash', sa.String(64), nullable=False),
        sa.Column('patient_id', UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))


def downgrade():
    op.drop_table('patient_creation_operations')
