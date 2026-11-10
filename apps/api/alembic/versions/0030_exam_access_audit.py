"""Allow prepared exam downloads without claiming transmission or receipt."""
from alembic import op
from sqlalchemy import text

revision = '0030_exam_access_audit'
down_revision = '0029_access_audit'
branch_labels = None
depends_on = None


def replace_action_checks(download):
    # 0029 used PostgreSQL-generated constraint names. Match their action
    # definitions rather than relying on numbering of unrelated constraints.
    connection = op.get_bind()
    names = connection.execute(text("""SELECT conname FROM pg_constraint
        WHERE conrelid='access_audit'::regclass AND contype='c'
          AND pg_get_constraintdef(oid) LIKE '%clinical.record_read%'""")).scalars().all()
    if len(names) != 3:
        raise RuntimeError('Unexpected access audit constraints')
    quote = connection.dialect.identifier_preparer.quote
    for name in names:
        op.execute('ALTER TABLE access_audit DROP CONSTRAINT ' + quote(name))
    extra_action = ",'exam.download_prepared'" if download else ''
    extra_shape = """OR (action='exam.download_prepared' AND patient_id IS NOT NULL
        AND returned_count=0 AND page_limit IS NULL AND page_offset IS NULL)""" if download else ''
    op.execute(f"""ALTER TABLE access_audit ADD CONSTRAINT access_audit_action
        CHECK(action IN ('clinical.record_read','clinical.appointment_read','clinical.patient_list'{extra_action}))""")
    op.execute(f"""ALTER TABLE access_audit ADD CONSTRAINT access_audit_shape CHECK(
        (action='clinical.patient_list' AND patient_id IS NOT NULL AND target_id=patient_id
         AND page_limit IS NOT NULL AND page_limit BETWEEN 1 AND 100
         AND page_offset IS NOT NULL AND page_offset>=0 AND returned_count<=page_limit)
        OR (action IN ('clinical.record_read','clinical.appointment_read')
            AND page_limit IS NULL AND page_offset IS NULL AND returned_count<=1)
        {extra_shape})""")
    op.execute("""ALTER TABLE access_audit ADD CONSTRAINT access_audit_record_target
        CHECK(action<>'clinical.record_read' OR
              (returned_count=1 AND patient_id IS NOT NULL AND record_ids[1]=target_id))""")


def upgrade():
    replace_action_checks(True)


def downgrade():
    op.execute("""DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM access_audit WHERE action='exam.download_prepared') THEN
            RAISE EXCEPTION 'Cannot discard prepared download history';
        END IF;
    END $$""")
    replace_action_checks(False)
