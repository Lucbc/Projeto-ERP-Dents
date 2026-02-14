"""add dentist details and procedures

Revision ID: 0003_dentists_procedures
Revises: 0002_roles_permissions
Create Date: 2026-02-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_dentists_procedures"
down_revision = "0002_roles_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dentists", sa.Column("specialty", sa.Text(), nullable=True))
    op.add_column(
        "dentists",
        sa.Column("availability", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )

    op.create_table(
        "procedures",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("price_cents", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_procedures_name", "procedures", ["name"], unique=False)

    op.get_bind().exec_driver_sql(
        """
        UPDATE role_permissions
        SET permissions = jsonb_set(
            COALESCE(permissions::jsonb, '{}'::jsonb),
            '{procedures}',
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
        SET permissions = (COALESCE(permissions::jsonb, '{}'::jsonb) - 'procedures')::json
        """
    )

    op.drop_index("ix_procedures_name", table_name="procedures")
    op.drop_table("procedures")
    op.drop_column("dentists", "availability")
    op.drop_column("dentists", "specialty")
