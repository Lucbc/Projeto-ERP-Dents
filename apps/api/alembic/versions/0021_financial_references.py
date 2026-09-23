"""Financial reference snapshots, independent of mutable clinical records."""
from alembic import op

revision = '0021_financial_references'
down_revision = '0020_financial_history'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    LOCK TABLE financial_entries, financial_payments IN SHARE ROW EXCLUSIVE MODE;
    CREATE TABLE financial_entry_references (
      entry_id uuid PRIMARY KEY REFERENCES financial_entries(id) ON DELETE CASCADE,
      snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object')
    );
    CREATE TABLE financial_payment_references (
      payment_id uuid PRIMARY KEY REFERENCES financial_payments(id) ON DELETE RESTRICT,
      snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object')
    );

    CREATE FUNCTION financial_reference_snapshot(e financial_entries, source text, strict_ids boolean)
    RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE patient_name text; dentist_name text; appointment_start timestamptz;
      raw_id text; procedure_name text; procedures_snapshot jsonb := '[]';
    BEGIN
      -- Nonblocking shared locks avoid reversing the lock order used by deletion
      -- (clinical row -> financial FK). The caller rolls back on contention.
      PERFORM id FROM appointments WHERE id=e.appointment_id FOR SHARE NOWAIT;
      IF strict_ids AND EXISTS(SELECT 1 FROM appointments WHERE id=e.appointment_id
        AND (patient_id IS DISTINCT FROM e.patient_id OR dentist_id IS DISTINCT FROM e.dentist_id)) THEN
        RAISE EXCEPTION 'Financial appointment references changed' USING ERRCODE='23503';
      END IF;
      PERFORM id FROM patients WHERE id=e.patient_id FOR SHARE NOWAIT;
      PERFORM id FROM dentists WHERE id=e.dentist_id FOR SHARE NOWAIT;
      PERFORM id FROM procedures WHERE id::text IN
        (SELECT json_array_elements_text(e.procedure_ids)) ORDER BY id FOR SHARE NOWAIT;
      SELECT full_name INTO patient_name FROM patients WHERE id=e.patient_id;
      SELECT full_name INTO dentist_name FROM dentists WHERE id=e.dentist_id;
      SELECT start_at INTO appointment_start FROM appointments WHERE id=e.appointment_id;
      FOR raw_id IN SELECT json_array_elements_text(e.procedure_ids) LOOP
        SELECT name INTO procedure_name FROM procedures WHERE id::text=raw_id;
        IF strict_ids AND procedure_name IS NULL THEN
          RAISE EXCEPTION 'Financial procedure reference unavailable' USING ERRCODE='23503';
        END IF;
        procedures_snapshot := procedures_snapshot || jsonb_build_array(
          jsonb_build_object('id',raw_id,'name',procedure_name));
      END LOOP;
      RETURN jsonb_build_object('schema_version',1,'origin',source,'captured_at',clock_timestamp(),
        'description',e.description,
        'patient',jsonb_build_object('id',e.patient_id,'name',patient_name),
        'dentist',jsonb_build_object('id',e.dentist_id,'name',dentist_name),
        'appointment',jsonb_build_object('id',e.appointment_id,'start_at',appointment_start),
        'procedures',procedures_snapshot);
    END $$;

    INSERT INTO financial_entry_references SELECT id,financial_reference_snapshot(e,'migration',false)
      FROM financial_entries e;
    INSERT INTO financial_payment_references SELECT p.id,financial_reference_snapshot(e,'migration',false)
      FROM financial_payments p JOIN financial_entries e ON e.id=p.entry_id;

    CREATE FUNCTION capture_financial_entry_references() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO financial_entry_references VALUES(NEW.id,financial_reference_snapshot(NEW,'recorded',true));
      RETURN NEW;
    END $$;
    CREATE TRIGGER capture_financial_entry_references AFTER INSERT ON financial_entries
      FOR EACH ROW EXECUTE FUNCTION capture_financial_entry_references();

    CREATE FUNCTION validate_financial_procedure_references() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.procedure_ids::jsonb IS DISTINCT FROM OLD.procedure_ids::jsonb THEN
        PERFORM financial_reference_snapshot(NEW,'recorded',true);
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER validate_financial_procedure_references BEFORE UPDATE ON financial_entries
      FOR EACH ROW EXECUTE FUNCTION validate_financial_procedure_references();

    CREATE FUNCTION capture_financial_payment_references() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE e financial_entries;
    BEGIN
      SELECT * INTO STRICT e FROM financial_entries WHERE id=NEW.entry_id FOR SHARE;
      INSERT INTO financial_payment_references VALUES(NEW.id,financial_reference_snapshot(e,'recorded',false));
      RETURN NEW;
    END $$;
    CREATE TRIGGER capture_financial_payment_references AFTER INSERT ON financial_payments
      FOR EACH ROW EXECUTE FUNCTION capture_financial_payment_references();

    CREATE FUNCTION protect_financial_reference() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      -- Only deletion by the parent draft's FK cascade is permitted.
      IF TG_TABLE_NAME='financial_entry_references' AND TG_OP='DELETE' THEN
        IF NOT EXISTS(SELECT 1 FROM financial_entries WHERE id=OLD.entry_id) THEN RETURN OLD; END IF;
      END IF;
      RAISE EXCEPTION 'Financial references are immutable' USING ERRCODE='23514';
    END $$;
    CREATE TRIGGER protect_financial_entry_reference BEFORE UPDATE OR DELETE ON financial_entry_references
      FOR EACH ROW EXECUTE FUNCTION protect_financial_reference();
    CREATE TRIGGER protect_financial_payment_reference BEFORE UPDATE OR DELETE ON financial_payment_references
      FOR EACH ROW EXECUTE FUNCTION protect_financial_reference();
    """)


def downgrade():
    op.execute("""
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM financial_entry_references WHERE snapshot->>'origin'='recorded')
        OR EXISTS(SELECT 1 FROM financial_payment_references WHERE snapshot->>'origin'='recorded')
      THEN RAISE EXCEPTION 'Recorded financial references exist; downgrade refused'; END IF;
    END $$;
    DROP TRIGGER capture_financial_payment_references ON financial_payments;
    DROP TRIGGER validate_financial_procedure_references ON financial_entries;
    DROP TRIGGER capture_financial_entry_references ON financial_entries;
    DROP TABLE financial_payment_references;
    DROP TABLE financial_entry_references;
    DROP FUNCTION protect_financial_reference();
    DROP FUNCTION capture_financial_payment_references();
    DROP FUNCTION validate_financial_procedure_references();
    DROP FUNCTION capture_financial_entry_references();
    DROP FUNCTION financial_reference_snapshot(financial_entries,text,boolean);
    """)
