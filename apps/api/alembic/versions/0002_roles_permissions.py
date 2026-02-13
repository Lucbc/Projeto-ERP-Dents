"""add coordinator/reception roles and role permissions

Revision ID: 0002_roles_permissions
Revises: 0001_initial
Create Date: 2026-02-13 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_roles_permissions"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'coordinator'")
        op.execute(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = 'user_role' AND e.enumlabel = 'receptionist'
                ) THEN
                    ALTER TYPE user_role RENAME VALUE 'receptionist' TO 'reception';
                END IF;
            END
            $$;
            """
        )

    op.create_table(
        "role_permissions",
        sa.Column(
            "role",
            postgresql.ENUM(
                "admin",
                "coordinator",
                "dentist",
                "reception",
                name="user_role",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("permissions", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("role"),
    )

    op.get_bind().exec_driver_sql(
        """
        INSERT INTO role_permissions(role, permissions, created_at, updated_at)
        VALUES
        (
            'coordinator',
            '{
                "dashboard":{"view":true,"create":false,"update":false,"delete":false},
                "patients":{"view":true,"create":true,"update":true,"delete":true},
                "dentists":{"view":true,"create":true,"update":true,"delete":true},
                "appointments":{"view":true,"create":true,"update":true,"delete":true},
                "calendar":{"view":true,"create":false,"update":false,"delete":false},
                "exams":{"view":true,"create":true,"update":false,"delete":true},
                "users":{"view":false,"create":false,"update":false,"delete":false},
                "permissions":{"view":false,"create":false,"update":false,"delete":false},
                "consultations":{"view":true,"create":false,"update":false,"delete":false}
            }'::json,
            now(),
            now()
        ),
        (
            'dentist',
            '{
                "dashboard":{"view":true,"create":false,"update":false,"delete":false},
                "patients":{"view":true,"create":false,"update":true,"delete":false},
                "dentists":{"view":true,"create":false,"update":false,"delete":false},
                "appointments":{"view":true,"create":false,"update":true,"delete":false},
                "calendar":{"view":true,"create":false,"update":false,"delete":false},
                "exams":{"view":true,"create":true,"update":false,"delete":false},
                "users":{"view":false,"create":false,"update":false,"delete":false},
                "permissions":{"view":false,"create":false,"update":false,"delete":false},
                "consultations":{"view":true,"create":false,"update":false,"delete":false}
            }'::json,
            now(),
            now()
        ),
        (
            'reception',
            '{
                "dashboard":{"view":true,"create":false,"update":false,"delete":false},
                "patients":{"view":true,"create":true,"update":true,"delete":false},
                "dentists":{"view":true,"create":false,"update":false,"delete":false},
                "appointments":{"view":true,"create":true,"update":true,"delete":true},
                "calendar":{"view":true,"create":false,"update":false,"delete":false},
                "exams":{"view":true,"create":true,"update":false,"delete":false},
                "users":{"view":false,"create":false,"update":false,"delete":false},
                "permissions":{"view":false,"create":false,"update":false,"delete":false},
                "consultations":{"view":false,"create":false,"update":false,"delete":false}
            }'::json,
            now(),
            now()
        )
        ON CONFLICT (role) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.drop_table("role_permissions")

    op.execute("ALTER TYPE user_role RENAME TO user_role_old")
    downgraded = sa.Enum("admin", "receptionist", "dentist", name="user_role")
    downgraded.create(op.get_bind(), checkfirst=False)

    op.execute(
        """
        ALTER TABLE users
        ALTER COLUMN role TYPE user_role
        USING (
            CASE
                WHEN role::text = 'reception' THEN 'receptionist'
                WHEN role::text = 'coordinator' THEN 'receptionist'
                ELSE role::text
            END
        )::user_role
        """
    )

    op.execute("DROP TYPE user_role_old")
