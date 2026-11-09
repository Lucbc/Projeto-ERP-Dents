"""Immutable patient edit metadata; no personal values or historical backfill."""
from alembic import op

revision = '0028_patient_audit'
down_revision = '0027_administrative_audit'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE patient_audit (
        id uuid PRIMARY KEY,
        occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        actor_id uuid NOT NULL,
        patient_id uuid NOT NULL,
        action text NOT NULL CHECK(action = 'patient.updated'),
        before_version bigint NOT NULL CHECK(before_version > 0),
        after_version bigint NOT NULL CHECK(after_version = before_version + 1),
        changed_fields text[] NOT NULL,
        CHECK(changed_fields <@ ARRAY['full_name','preferred_name','birth_date','cpf','rg',
            'phone','email','address','preferred_contact_method','emergency_contact_name',
            'emergency_contact_phone','insurance_provider','insurance_plan','insurance_member_id',
            'allergies','medical_history','notes','active']::text[]),
        UNIQUE(patient_id, after_version)
    )""")
    for column in ('patient_id', 'actor_id'):
        op.execute(f'CREATE INDEX ix_patient_audit_{column} ON patient_audit({column},occurred_at DESC,id DESC)')
    op.execute("""CREATE FUNCTION patient_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Patient audit is append only' USING ERRCODE='23514'; END $$""")
    op.execute("""CREATE TRIGGER patient_audit_immutable BEFORE UPDATE OR DELETE ON patient_audit
        FOR EACH ROW EXECUTE FUNCTION patient_audit_immutable()""")
    op.execute("""CREATE TRIGGER patient_audit_no_truncate BEFORE TRUNCATE ON patient_audit
        FOR EACH STATEMENT EXECUTE FUNCTION patient_audit_immutable()""")


def downgrade():
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM patient_audit) THEN
            RAISE EXCEPTION 'Cannot discard patient audit history';
        END IF;
    END $$""")
    op.execute('DROP TABLE patient_audit')
    op.execute('DROP FUNCTION patient_audit_immutable()')
