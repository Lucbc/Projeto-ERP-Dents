"""Enforce one active charge per appointment and persist generation retries."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0013_financial_generation'
down_revision = '0012_appointment_exclusion'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('LOCK TABLE financial_entries IN ACCESS EXCLUSIVE MODE')
    duplicate = op.get_bind().scalar(sa.text('''SELECT EXISTS (
        SELECT appointment_id FROM financial_entries
        WHERE appointment_id IS NOT NULL AND status <> 'cancelled'
        GROUP BY appointment_id HAVING count(*) > 1)'''))
    if duplicate:
        raise RuntimeError('Existem cobrancas ativas duplicadas por consulta. '
                           'Revise os registros localmente antes de atualizar; nenhum dado foi alterado.')
    op.create_index('uq_financial_active_appointment', 'financial_entries', ['appointment_id'],
                    unique=True, postgresql_where=sa.text("status <> 'cancelled' AND appointment_id IS NOT NULL"))
    op.create_table('financial_generations',
        sa.Column('key', UUID(as_uuid=True), primary_key=True),
        sa.Column('request_hash', sa.Text(), nullable=False),
        sa.Column('entry_id', UUID(as_uuid=True), sa.ForeignKey('financial_entries.id', ondelete='SET NULL'), nullable=True))


def downgrade():
    op.drop_table('financial_generations')
    op.drop_index('uq_financial_active_appointment', table_name='financial_entries')
