"""Append-only administrative events, without personal field values or secrets."""
from alembic import op

revision = '0027_administrative_audit'
down_revision = '0026_clinical_records'
branch_labels = None
depends_on = None


def upgrade():
    # Deliberately no FK to users: deleting an account must not erase its history.
    op.execute('''CREATE TABLE administrative_audit (
        id uuid PRIMARY KEY,
        occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        actor_id uuid NOT NULL,
        action text NOT NULL CHECK(action IN ('user.created','user.updated',
            'user.password_reset','user.deleted','permissions.updated')),
        target_user_id uuid,
        target_role text CHECK(target_role IN ('admin','coordinator','dentist','reception')),
        before_version bigint CHECK(before_version >= 0),
        after_version bigint CHECK(after_version > 0),
        changed_fields text[] NOT NULL DEFAULT '{}',
        permission_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
        CHECK(changed_fields <@ ARRAY['name','email','role','dentist_id','is_active']::text[]),
        CHECK(jsonb_typeof(permission_changes) = 'array'),
        CHECK((action = 'permissions.updated' AND target_user_id IS NULL AND target_role IS NOT NULL
               AND cardinality(changed_fields) = 0)
           OR (action <> 'permissions.updated' AND target_user_id IS NOT NULL AND target_role IS NULL
               AND permission_changes = '[]'::jsonb)),
        CHECK((action = 'user.created' AND before_version IS NULL AND after_version IS NOT NULL AND after_version = 1)
           OR (action = 'user.deleted' AND before_version IS NOT NULL AND before_version > 0 AND after_version IS NULL)
           OR (action IN ('user.updated','user.password_reset') AND before_version IS NOT NULL AND after_version IS NOT NULL AND before_version > 0
               AND after_version = before_version + 1)
           OR (action = 'permissions.updated' AND before_version IS NOT NULL AND after_version IS NOT NULL AND before_version >= 0
               AND after_version = before_version + 1))
    )''')
    op.execute('CREATE INDEX ix_administrative_audit_time ON administrative_audit(occurred_at DESC,id DESC)')
    op.execute('CREATE INDEX ix_administrative_audit_actor ON administrative_audit(actor_id,occurred_at DESC,id DESC)')
    op.execute('CREATE INDEX ix_administrative_audit_user ON administrative_audit(target_user_id,occurred_at DESC,id DESC)')
    op.execute('''CREATE FUNCTION administrative_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Administrative audit is append only' USING ERRCODE='23514'; END $$''')
    op.execute('''CREATE TRIGGER administrative_audit_immutable BEFORE UPDATE OR DELETE ON administrative_audit
        FOR EACH ROW EXECUTE FUNCTION administrative_audit_immutable()''')
    op.execute('''CREATE TRIGGER administrative_audit_no_truncate BEFORE TRUNCATE ON administrative_audit
        FOR EACH STATEMENT EXECUTE FUNCTION administrative_audit_immutable()''')


def downgrade():
    op.execute('''DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM administrative_audit) THEN
            RAISE EXCEPTION 'Cannot discard administrative audit history';
        END IF;
    END $$''')
    op.execute('DROP TABLE administrative_audit')
    op.execute('DROP FUNCTION administrative_audit_immutable()')
