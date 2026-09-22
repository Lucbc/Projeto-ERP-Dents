"""Immutable payment history and atomic operation receipts."""
from alembic import op

revision = '0020_financial_history'
down_revision = '0019_financial_version'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM financial_entries WHERE
        (status='paid' AND paid_at IS NULL) OR (status<>'paid' AND paid_at IS NOT NULL)
        OR amount_cents<0 OR discount_cents<0 OR tax_cents<0 OR total_cents<0
        OR total_cents::bigint<>amount_cents::bigint-discount_cents::bigint+tax_cents::bigint)
      THEN RAISE EXCEPTION 'Financial legacy inconsistencies: migration aborted; review required'; END IF;
    END $$;
    CREATE TABLE financial_payments (
      id uuid PRIMARY KEY, entry_id uuid NOT NULL REFERENCES financial_entries(id) ON DELETE RESTRICT,
      entry_type text NOT NULL CHECK(entry_type IN ('income','expense')),
      amount_cents integer NOT NULL CHECK(amount_cents>=0),
      discount_cents integer NOT NULL CHECK(discount_cents>=0),
      tax_cents integer NOT NULL CHECK(tax_cents>=0),
      total_cents integer NOT NULL CHECK(total_cents>=0 AND total_cents::bigint=amount_cents::bigint-discount_cents::bigint+tax_cents::bigint),
      paid_at timestamptz NOT NULL, payment_method text,
      recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      actor_id uuid, actor_name text,
      origin text NOT NULL CHECK(origin IN ('legacy','recorded')),
      CHECK ((origin='legacy' AND actor_id IS NULL AND actor_name IS NULL) OR
             (origin='recorded' AND actor_id IS NOT NULL AND actor_name IS NOT NULL AND length(trim(actor_name))>0)),
      UNIQUE(entry_id,id)
    );
    CREATE INDEX ix_financial_payments_entry ON financial_payments(entry_id,recorded_at);
    CREATE TABLE financial_reversals (
      id uuid PRIMARY KEY, payment_id uuid NOT NULL UNIQUE REFERENCES financial_payments(id) ON DELETE RESTRICT,
      recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      actor_id uuid NOT NULL, actor_name text NOT NULL CHECK(length(trim(actor_name))>0),
      reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 500),
      UNIQUE(payment_id,id)
    );
    CREATE TABLE financial_operations (
      key uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('settle','reverse','create','generate')),
      request_hash text NOT NULL, entry_id uuid NOT NULL REFERENCES financial_entries(id) ON DELETE RESTRICT,
      payment_id uuid NOT NULL REFERENCES financial_payments(id) ON DELETE RESTRICT,
      reversal_id uuid REFERENCES financial_reversals(id) ON DELETE RESTRICT,
      FOREIGN KEY(entry_id,payment_id) REFERENCES financial_payments(entry_id,id),
      FOREIGN KEY(payment_id,reversal_id) REFERENCES financial_reversals(payment_id,id),
      CHECK ((kind='reverse') = (reversal_id IS NOT NULL))
    );
    ALTER TABLE financial_entries ADD COLUMN active_payment_id uuid;
    INSERT INTO financial_payments(id,entry_id,entry_type,amount_cents,discount_cents,tax_cents,total_cents,paid_at,payment_method,origin)
      SELECT id,id,entry_type::text,amount_cents,discount_cents,tax_cents,total_cents,paid_at,payment_method::text,'legacy'
      FROM financial_entries WHERE status='paid';
    UPDATE financial_entries SET active_payment_id=id WHERE status='paid';
    ALTER TABLE financial_entries ADD CONSTRAINT fk_financial_active_payment
      FOREIGN KEY(id,active_payment_id) REFERENCES financial_payments(entry_id,id) DEFERRABLE INITIALLY DEFERRED;
    ALTER TABLE financial_entries ADD CONSTRAINT ck_financial_active_payment
      CHECK ((status='paid' AND active_payment_id IS NOT NULL AND paid_at IS NOT NULL)
          OR (status<>'paid' AND active_payment_id IS NULL AND paid_at IS NULL));
    CREATE FUNCTION financial_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Financial history is immutable' USING ERRCODE='23514'; END $$;
    CREATE TRIGGER financial_payments_immutable BEFORE UPDATE OR DELETE ON financial_payments
      FOR EACH ROW EXECUTE FUNCTION financial_history_immutable();
    CREATE TRIGGER financial_reversals_immutable BEFORE UPDATE OR DELETE ON financial_reversals
      FOR EACH ROW EXECUTE FUNCTION financial_history_immutable();
    CREATE TRIGGER financial_operations_immutable BEFORE UPDATE OR DELETE ON financial_operations
      FOR EACH ROW EXECUTE FUNCTION financial_history_immutable();
    CREATE FUNCTION financial_history_consistent() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target uuid; entry financial_entries%ROWTYPE; active_count integer;
    BEGIN
      IF TG_TABLE_NAME='financial_entries' THEN target := NEW.id;
      ELSIF TG_TABLE_NAME='financial_payments' THEN target := NEW.entry_id;
      ELSE SELECT entry_id INTO target FROM financial_payments WHERE id=NEW.payment_id; END IF;
      SELECT * INTO entry FROM financial_entries WHERE id=target;
      IF NOT FOUND THEN RETURN NULL; END IF;
      SELECT count(*) INTO active_count FROM financial_payments p WHERE p.entry_id=target
        AND NOT EXISTS(SELECT 1 FROM financial_reversals r WHERE r.payment_id=p.id);
      IF active_count <> (CASE WHEN entry.status='paid' THEN 1 ELSE 0 END) THEN
        RAISE EXCEPTION 'Financial active payment mismatch' USING ERRCODE='23514';
      END IF;
      IF entry.status='paid' AND NOT EXISTS (SELECT 1 FROM financial_payments p
        WHERE p.id=entry.active_payment_id AND p.entry_id=entry.id AND p.entry_type=entry.entry_type::text
        AND p.amount_cents=entry.amount_cents AND p.discount_cents=entry.discount_cents
        AND p.tax_cents=entry.tax_cents AND p.total_cents=entry.total_cents AND p.paid_at=entry.paid_at
        AND p.payment_method IS NOT DISTINCT FROM entry.payment_method::text
        AND NOT EXISTS(SELECT 1 FROM financial_reversals r WHERE r.payment_id=p.id)) THEN
        RAISE EXCEPTION 'Financial payment snapshot mismatch' USING ERRCODE='23514';
      END IF;
      RETURN NULL;
    END $$;
    CREATE CONSTRAINT TRIGGER financial_entry_consistent AFTER INSERT OR UPDATE ON financial_entries
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION financial_history_consistent();
    CREATE CONSTRAINT TRIGGER financial_payment_consistent AFTER INSERT ON financial_payments
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION financial_history_consistent();
    CREATE CONSTRAINT TRIGGER financial_reversal_consistent AFTER INSERT ON financial_reversals
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION financial_history_consistent();
    """)


def downgrade():
    op.execute("""
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM financial_payments WHERE origin='recorded') OR EXISTS(SELECT 1 FROM financial_reversals)
      THEN RAISE EXCEPTION 'Cannot discard recorded financial history'; END IF;
    END $$;
    DROP TRIGGER financial_entry_consistent ON financial_entries;
    DROP TRIGGER financial_payment_consistent ON financial_payments;
    DROP TRIGGER financial_reversal_consistent ON financial_reversals;
    DROP FUNCTION financial_history_consistent();
    ALTER TABLE financial_entries DROP CONSTRAINT fk_financial_active_payment;
    ALTER TABLE financial_entries DROP CONSTRAINT ck_financial_active_payment;
    ALTER TABLE financial_entries DROP COLUMN active_payment_id;
    DROP TABLE financial_operations, financial_reversals, financial_payments;
    DROP FUNCTION financial_history_immutable();
    """)
