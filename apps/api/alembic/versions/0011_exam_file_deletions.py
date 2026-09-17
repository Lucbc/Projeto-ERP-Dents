"""Persist physical cleanup after committed exam/patient deletion."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0011_exam_file_deletions"
down_revision = "0010_auth_attempts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("exam_file_deletions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stored_filename", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("patient_id", "stored_filename", name="uq_exam_file_deletion"))


def downgrade():
    op.drop_table("exam_file_deletions")
