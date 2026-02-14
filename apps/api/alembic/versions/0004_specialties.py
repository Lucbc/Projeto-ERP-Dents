"""add specialties

Revision ID: 0004_specialties
Revises: 0003_dentists_procedures
Create Date: 2026-02-14 00:00:01.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_specialties"
down_revision = "0003_dentists_procedures"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "specialties",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_specialties_name", "specialties", ["name"], unique=True)

    op.get_bind().exec_driver_sql(
        """
        UPDATE role_permissions
        SET permissions = jsonb_set(
            COALESCE(permissions::jsonb, '{}'::jsonb),
            '{specialties}',
            CASE
                WHEN role = 'coordinator' THEN '{"view":true,"create":true,"update":true,"delete":true}'::jsonb
                WHEN role = 'dentist' THEN '{"view":true,"create":false,"update":false,"delete":false}'::jsonb
                WHEN role = 'reception' THEN '{"view":true,"create":false,"update":false,"delete":false}'::jsonb
                ELSE '{"view":false,"create":false,"update":false,"delete":false}'::jsonb
            END,
            true
        )::json
        """
    )


def downgrade() -> None:
    op.get_bind().exec_driver_sql(
        """
        UPDATE role_permissions
        SET permissions = (COALESCE(permissions::jsonb, '{}'::jsonb) - 'specialties')::json
        """
    )

    op.drop_index("ix_specialties_name", table_name="specialties")
    op.drop_table("specialties")
