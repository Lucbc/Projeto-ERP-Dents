"""Add clinical records, append-only addenda and durable operation receipts."""
from alembic import op
import sqlalchemy as sa

revision = '0026_clinical_records'
down_revision = '0025_patient_creation_operations'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('''ALTER TABLE appointments ADD CONSTRAINT uq_appointment_clinical_identity
        UNIQUE (id, patient_id, dentist_id)''')
    op.execute('''CREATE TABLE clinical_records (
        id uuid PRIMARY KEY, appointment_id uuid NOT NULL UNIQUE,
        patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
        dentist_id uuid NOT NULL REFERENCES dentists(id) ON DELETE RESTRICT,
        author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        author_name text NOT NULL, text text NOT NULL,
        version bigint NOT NULL CHECK(version > 0),
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
        finalized_at timestamptz, context jsonb,
        CONSTRAINT fk_clinical_appointment FOREIGN KEY (appointment_id,patient_id,dentist_id)
          REFERENCES appointments(id,patient_id,dentist_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        UNIQUE(id,author_id,dentist_id),
        CHECK(updated_at >= created_at),
        CHECK((finalized_at IS NULL AND context IS NULL) OR
              (finalized_at IS NOT NULL AND finalized_at >= created_at AND updated_at >= finalized_at
               AND length(btrim(text)) > 0 AND context IS NOT NULL AND jsonb_typeof(context)='object'))
    )''')
    op.execute('CREATE INDEX ix_clinical_patient ON clinical_records(patient_id,created_at,id)')
    op.execute('''CREATE TABLE clinical_addenda (
        id uuid PRIMARY KEY, record_id uuid NOT NULL,
        author_id uuid NOT NULL, dentist_id uuid NOT NULL, author_name text NOT NULL,
        text text NOT NULL CHECK(length(btrim(text)) > 0),
        reason text NOT NULL CHECK(length(btrim(reason)) > 0),
        recorded_at timestamptz NOT NULL, record_version bigint NOT NULL CHECK(record_version > 1),
        FOREIGN KEY(record_id,author_id,dentist_id) REFERENCES clinical_records(id,author_id,dentist_id) ON DELETE RESTRICT,
        UNIQUE(record_id,record_version)
    )''')
    op.execute('''CREATE TABLE clinical_operations (
        actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        key uuid NOT NULL, request_hash varchar(64) NOT NULL,
        record_id uuid NOT NULL REFERENCES clinical_records(id) ON DELETE RESTRICT,
        result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(actor_id,key)
    )''')
    op.execute('''CREATE FUNCTION clinical_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'clinical record deletion prohibited' USING ERRCODE='23514';
      END IF;
      IF ROW(NEW.id,NEW.appointment_id,NEW.patient_id,NEW.dentist_id,NEW.author_id,NEW.author_name,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id,OLD.appointment_id,OLD.patient_id,OLD.dentist_id,OLD.author_id,OLD.author_name,OLD.created_at)
        OR NEW.version <> OLD.version+1 OR NEW.updated_at < OLD.updated_at THEN
        RAISE EXCEPTION 'clinical identity or version violation' USING ERRCODE='23514';
      END IF;
      IF OLD.finalized_at IS NOT NULL AND ROW(NEW.text,NEW.context,NEW.finalized_at)
        IS DISTINCT FROM ROW(OLD.text,OLD.context,OLD.finalized_at) THEN
        RAISE EXCEPTION 'finalized clinical record is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$''')
    op.execute('''CREATE TRIGGER clinical_record_guard BEFORE UPDATE OR DELETE ON clinical_records
        FOR EACH ROW EXECUTE FUNCTION clinical_record_guard()''')
    op.execute('''CREATE FUNCTION clinical_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'clinical history is append only' USING ERRCODE='23514'; END $$''')
    for table in ('clinical_addenda', 'clinical_operations'):
        op.execute(f'''CREATE TRIGGER clinical_append_only BEFORE UPDATE OR DELETE ON {table}
            FOR EACH ROW EXECUTE FUNCTION clinical_append_only()''')
    op.execute('''CREATE FUNCTION clinical_addendum_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE r clinical_records%ROWTYPE;
    BEGIN
      SELECT * INTO r FROM clinical_records WHERE id=NEW.record_id FOR UPDATE;
      IF r.finalized_at IS NULL OR NEW.recorded_at < r.finalized_at
        OR NEW.record_version IS DISTINCT FROM r.version THEN
        RAISE EXCEPTION 'invalid clinical addendum' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$''')
    op.execute('''CREATE TRIGGER clinical_addendum_guard BEFORE INSERT ON clinical_addenda
        FOR EACH ROW EXECUTE FUNCTION clinical_addendum_guard()''')


def downgrade():
    if op.get_bind().scalar(sa.text('SELECT EXISTS(SELECT 1 FROM clinical_records)')):
        raise RuntimeError('Clinical records exist; destructive downgrade refused.')
    for table in ('clinical_operations', 'clinical_addenda', 'clinical_records'):
        op.drop_table(table)
    for name in ('clinical_addendum_guard', 'clinical_append_only', 'clinical_record_guard'):
        op.execute(f'DROP FUNCTION {name}()')
    op.drop_constraint('uq_appointment_clinical_identity', 'appointments', type_='unique')
