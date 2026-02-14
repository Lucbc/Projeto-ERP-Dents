"""add financial module and complete patient profile

Revision ID: 0007_financial_patient
Revises: 0006_dentist_color
Create Date: 2026-02-14 12:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0007_financial_patient"
down_revision = "0006_dentist_color"
branch_labels = None
depends_on = None


financial_entry_type_enum = postgresql.ENUM(
    "income",
    "expense",
    name="financial_entry_type",
    create_type=False,
)
financial_entry_status_enum = postgresql.ENUM(
    "pending",
    "paid",
    "cancelled",
    name="financial_entry_status",
    create_type=False,
)
payment_method_enum = postgresql.ENUM(
    "cash",
    "pix",
    "credit_card",
    "debit_card",
    "bank_transfer",
    "boleto",
    "insurance",
    "other",
    name="payment_method",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    financial_entry_type_enum.create(bind, checkfirst=True)
    financial_entry_status_enum.create(bind, checkfirst=True)
    payment_method_enum.create(bind, checkfirst=True)

    op.add_column("patients", sa.Column("preferred_name", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("rg", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("preferred_contact_method", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("emergency_contact_name", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("emergency_contact_phone", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("insurance_provider", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("insurance_plan", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("insurance_member_id", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("allergies", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("medical_history", sa.Text(), nullable=True))
    op.add_column(
        "patients",
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.create_table(
        "financial_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entry_type", financial_entry_type_enum, nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("discount_cents", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("tax_cents", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", financial_entry_status_enum, nullable=False),
        sa.Column("payment_method", payment_method_enum, nullable=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("dentist_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("appointment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("procedure_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["patient_id"], ["patients.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["dentist_id"], ["dentists.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["appointment_id"], ["appointments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_financial_entries_due_date", "financial_entries", ["due_date"], unique=False)
    op.create_index(
        "ix_financial_entries_status_due_date",
        "financial_entries",
        ["status", "due_date"],
        unique=False,
    )
    op.create_index(
        "ix_financial_entries_type_due_date",
        "financial_entries",
        ["entry_type", "due_date"],
        unique=False,
    )
    op.create_index(
        "ix_financial_entries_patient_due_date",
        "financial_entries",
        ["patient_id", "due_date"],
        unique=False,
    )
    op.create_index(
        "ix_financial_entries_dentist_due_date",
        "financial_entries",
        ["dentist_id", "due_date"],
        unique=False,
    )
    op.create_index(
        "ix_financial_entries_appointment_id",
        "financial_entries",
        ["appointment_id"],
        unique=False,
    )

    op.get_bind().exec_driver_sql(
        """
        UPDATE role_permissions
        SET permissions = jsonb_set(
            COALESCE(permissions::jsonb, '{}'::jsonb),
            '{financial}',
            CASE
                WHEN role = 'coordinator' THEN '{"view":true,"create":true,"update":true,"delete":true}'::jsonb
                WHEN role = 'dentist' THEN '{"view":true,"create":false,"update":false,"delete":false}'::jsonb
                WHEN role = 'reception' THEN '{"view":true,"create":true,"update":true,"delete":false}'::jsonb
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
        SET permissions = (COALESCE(permissions::jsonb, '{}'::jsonb) - 'financial')::json
        """
    )

    op.drop_index("ix_financial_entries_appointment_id", table_name="financial_entries")
    op.drop_index("ix_financial_entries_dentist_due_date", table_name="financial_entries")
    op.drop_index("ix_financial_entries_patient_due_date", table_name="financial_entries")
    op.drop_index("ix_financial_entries_type_due_date", table_name="financial_entries")
    op.drop_index("ix_financial_entries_status_due_date", table_name="financial_entries")
    op.drop_index("ix_financial_entries_due_date", table_name="financial_entries")
    op.drop_table("financial_entries")

    op.drop_column("patients", "active")
    op.drop_column("patients", "medical_history")
    op.drop_column("patients", "allergies")
    op.drop_column("patients", "insurance_member_id")
    op.drop_column("patients", "insurance_plan")
    op.drop_column("patients", "insurance_provider")
    op.drop_column("patients", "emergency_contact_phone")
    op.drop_column("patients", "emergency_contact_name")
    op.drop_column("patients", "preferred_contact_method")
    op.drop_column("patients", "rg")
    op.drop_column("patients", "preferred_name")

    payment_method_enum.drop(op.get_bind(), checkfirst=True)
    financial_entry_status_enum.drop(op.get_bind(), checkfirst=True)
    financial_entry_type_enum.drop(op.get_bind(), checkfirst=True)
