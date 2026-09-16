"""Persist completion of the initial administrator setup."""
from alembic import op
import sqlalchemy as sa

revision = "0008_installation_state"
down_revision = "0007_financial_patient"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "installation_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bootstrap_completed", sa.Boolean(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_installation_singleton"),
    )
    # Existing installations must never be offered public initialization again.
    op.execute("""INSERT INTO installation_state (id, bootstrap_completed)
                  VALUES (1, EXISTS (SELECT 1 FROM users))""")


def downgrade() -> None:
    op.drop_table("installation_state")
