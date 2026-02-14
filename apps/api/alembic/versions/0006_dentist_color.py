"""add dentist color

Revision ID: 0006_dentist_color
Revises: 0005_appointment_procedures
Create Date: 2026-02-14 00:00:03.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_dentist_color"
down_revision = "0005_appointment_procedures"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dentists", sa.Column("color", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("dentists", "color")
