"""Initial schema with audit log immutability trigger

Revision ID: 001_initial
Revises: 
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('phone', sa.String(15), nullable=False, unique=True),
        sa.Column('email', sa.String(255), nullable=True, unique=True),
        sa.Column('name', sa.String(100), nullable=True),
        sa.Column('upi_id', sa.String(100), nullable=True),
        sa.Column('avatar_url', sa.String(500), nullable=True),
        sa.Column('is_paid_tier', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_users_phone', 'users', ['phone'])

    # ── otp_records ────────────────────────────────────────────────────
    op.create_table(
        'otp_records',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('phone', sa.String(15), nullable=False),
        sa.Column('otp_hash', sa.String(255), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_used', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_otp_records_phone', 'otp_records', ['phone'])

    # ── groups ─────────────────────────────────────────────────────────
    op.create_table(
        'groups',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('is_archived', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── group_members ──────────────────────────────────────────────────
    op.create_table(
        'group_members',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('groups.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='member'),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('group_id', 'user_id', name='uq_group_member'),
    )

    # ── expenses ───────────────────────────────────────────────────────
    op.create_table(
        'expenses',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('groups.id'), nullable=False),
        sa.Column('paid_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('description', sa.String(255), nullable=False),
        sa.Column('category', sa.String(30), nullable=False, server_default='misc'),
        sa.Column('split_type', sa.String(20), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default='false'),
        sa.Column('is_disputed', sa.Boolean(), server_default='false'),
        sa.Column('is_settled', sa.Boolean(), server_default='false'),
        sa.Column('dispute_note', sa.Text(), nullable=True),
        sa.Column('dispute_raised_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── splits ─────────────────────────────────────────────────────────
    op.create_table(
        'splits',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('expense_id', sa.Integer(), sa.ForeignKey('expenses.id'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('split_type', sa.String(20), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('percentage', sa.Numeric(5, 2), nullable=True),
    )

    # ── settlements ────────────────────────────────────────────────────
    op.create_table(
        'settlements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('groups.id'), nullable=False),
        sa.Column('payer_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('receiver_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('dispute_note', sa.Text(), nullable=True),
        sa.Column('resolution_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), nullable=True),
    )

    # ── audit_logs ─────────────────────────────────────────────────────
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('groups.id'), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('actor_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('before_json', postgresql.JSON(), nullable=True),
        sa.Column('after_json', postgresql.JSON(), nullable=True),
        sa.Column('metadata_json', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_audit_logs_group_entity', 'audit_logs', ['group_id', 'entity_id', 'created_at'])

    # ── proof_attachments ──────────────────────────────────────────────
    op.create_table(
        'proof_attachments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('expense_id', sa.Integer(), sa.ForeignKey('expenses.id'), nullable=False),
        sa.Column('s3_key', sa.String(500), nullable=False),
        sa.Column('file_hash', sa.String(64), nullable=False),
        sa.Column('file_name', sa.String(255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=False),
        sa.Column('uploader_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── invite_links ───────────────────────────────────────────────────
    op.create_table(
        'invite_links',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('groups.id'), nullable=False),
        sa.Column('token', sa.String(64), nullable=False, unique=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('max_uses', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('use_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_invite_links_token', 'invite_links', ['token'])

    # ── CRITICAL: Audit log immutability trigger ────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs is append-only and cannot be modified or deleted';
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER audit_log_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_log_immutable ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_mutation()")
    op.drop_table('invite_links')
    op.drop_table('proof_attachments')
    op.drop_table('audit_logs')
    op.drop_table('settlements')
    op.drop_table('splits')
    op.drop_table('expenses')
    op.drop_table('group_members')
    op.drop_table('groups')
    op.drop_table('otp_records')
    op.drop_table('users')
