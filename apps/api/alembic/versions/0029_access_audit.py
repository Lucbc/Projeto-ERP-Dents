"""Authorized clinical queries, without clinical content or delivery claims."""
from alembic import op

revision = '0029_access_audit'
down_revision = '0028_patient_audit'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE access_audit (
        id uuid PRIMARY KEY,
        occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        actor_id uuid NOT NULL,
        action text NOT NULL CHECK(action IN
            ('clinical.record_read','clinical.appointment_read','clinical.patient_list')),
        target_id uuid NOT NULL,
        patient_id uuid,
        record_ids uuid[] NOT NULL,
        record_versions bigint[] NOT NULL,
        returned_count integer NOT NULL CHECK(returned_count BETWEEN 0 AND 100),
        page_limit integer,
        page_offset integer,
        CHECK(cardinality(record_ids) = returned_count AND cardinality(record_versions) = returned_count),
        CHECK(coalesce(array_ndims(record_ids),1) = 1 AND coalesce(array_ndims(record_versions),1) = 1),
        CHECK(coalesce(array_lower(record_ids,1),1) = 1 AND coalesce(array_lower(record_versions,1),1) = 1),
        CHECK(array_position(record_ids,NULL) IS NULL AND array_position(record_versions,NULL) IS NULL),
        CHECK(0 < ALL(record_versions)),
        CHECK((action = 'clinical.patient_list' AND patient_id IS NOT NULL AND target_id = patient_id
               AND page_limit IS NOT NULL AND page_limit BETWEEN 1 AND 100
               AND page_offset IS NOT NULL AND page_offset >= 0 AND returned_count <= page_limit)
           OR (action IN ('clinical.record_read','clinical.appointment_read')
               AND page_limit IS NULL AND page_offset IS NULL AND returned_count <= 1)),
        CHECK(action <> 'clinical.record_read' OR
              (returned_count = 1 AND patient_id IS NOT NULL AND record_ids[1] = target_id)),
        CHECK(returned_count = 0 OR patient_id IS NOT NULL)
    )""")
    for column in ('actor_id', 'patient_id'):
        op.execute(f'CREATE INDEX ix_access_audit_{column} ON access_audit({column},occurred_at DESC,id DESC)')
    op.execute("""CREATE FUNCTION access_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Access audit is append only' USING ERRCODE='23514'; END $$""")
    op.execute("""CREATE TRIGGER access_audit_immutable BEFORE UPDATE OR DELETE ON access_audit
        FOR EACH ROW EXECUTE FUNCTION access_audit_immutable()""")
    op.execute("""CREATE TRIGGER access_audit_no_truncate BEFORE TRUNCATE ON access_audit
        FOR EACH STATEMENT EXECUTE FUNCTION access_audit_immutable()""")


def downgrade():
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM access_audit) THEN
            RAISE EXCEPTION 'Cannot discard access audit history';
        END IF;
    END $$""")
    op.execute('DROP TABLE access_audit')
    op.execute('DROP FUNCTION access_audit_immutable()')
