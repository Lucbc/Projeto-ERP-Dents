"""Shared, persistent authentication attempt windows."""
from alembic import op
import sqlalchemy as sa

revision = "0010_auth_attempts"
down_revision = "0009_auth_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("auth_attempts",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_auth_attempts_expires_at", "auth_attempts", ["expires_at"])


def downgrade() -> None:
    op.drop_table("auth_attempts")
