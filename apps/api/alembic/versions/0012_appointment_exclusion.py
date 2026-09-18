"""Prevent concurrent appointment overlaps without rewriting existing records."""
from alembic import op
import sqlalchemy as sa

revision = '0012_appointment_exclusion'
down_revision = '0011_exam_file_deletions'
branch_labels = None
depends_on = None


def upgrade():
    # Serialize preflight and DDL; never silently cancel or move existing bookings.
    op.execute('LOCK TABLE appointments IN ACCESS EXCLUSIVE MODE')
    connection = op.get_bind()
    invalid = connection.scalar(sa.text('SELECT count(*) FROM appointments WHERE end_at <= start_at'))
    overlaps = connection.scalar(sa.text('''
        SELECT count(*) FROM appointments a JOIN appointments b ON a.id < b.id
        AND (a.dentist_id = b.dentist_id OR a.patient_id = b.patient_id)
        AND a.start_at < b.end_at AND a.end_at > b.start_at
        WHERE a.status <> 'cancelled' AND b.status <> 'cancelled'
    '''))
    if invalid or overlaps:
        raise RuntimeError('Agenda possui intervalos invalidos ou sobrepostos. '
                           'Revise os registros localmente antes de atualizar; nenhum dado foi alterado.')
    op.execute('CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public')
    op.create_check_constraint('ck_appointments_positive_interval', 'appointments', 'end_at > start_at')
    for field in ('dentist_id', 'patient_id'):
        op.execute(f'''ALTER TABLE appointments ADD CONSTRAINT ex_appointments_{field}
            EXCLUDE USING gist ({field} public.gist_uuid_ops WITH =,
                tstzrange(start_at, end_at, '[)') WITH &&)
            WHERE (status <> 'cancelled')''')


def downgrade():
    for field in ('patient_id', 'dentist_id'):
        op.drop_constraint(f'ex_appointments_{field}', 'appointments')
    op.drop_constraint('ck_appointments_positive_interval', 'appointments')
    # btree_gist can be shared by other schemas: do not drop the extension.
