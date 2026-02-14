"""add appointment procedures relation

Revision ID: 0005_appointment_procedures
Revises: 0004_specialties
Create Date: 2026-02-14 00:00:02.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_appointment_procedures"
down_revision = "0004_specialties"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "appointment_procedures",
        sa.Column("appointment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("procedure_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["procedure_id"], ["procedures.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("appointment_id", "procedure_id"),
    )
    op.create_index(
        "ix_appointment_procedures_procedure_id",
        "appointment_procedures",
        ["procedure_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_appointment_procedures_procedure_id", table_name="appointment_procedures")
    op.drop_table("appointment_procedures")
