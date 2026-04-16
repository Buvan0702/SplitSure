"""Add invitations table for in-app and link-based group invites

Revision ID: 003
Revises: 002
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa


revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("groups.id"), nullable=False),
        sa.Column("inviter_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("invitee_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("invitee_phone", sa.String(length=20), nullable=True),
        sa.Column("invitee_email", sa.String(length=255), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=True, unique=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_invitations_group_id", "invitations", ["group_id"])
    op.create_index("ix_invitations_inviter_id", "invitations", ["inviter_id"])
    op.create_index("ix_invitations_invitee_user_id", "invitations", ["invitee_user_id"])
    op.create_index("ix_invitations_invitee_phone", "invitations", ["invitee_phone"])
    op.create_index("ix_invitations_invitee_email", "invitations", ["invitee_email"])
    op.create_index("ix_invitations_token_hash", "invitations", ["token_hash"])
    op.create_index("ix_invitations_token_expires_at", "invitations", ["token_expires_at"])
    op.create_index("ix_invitations_status", "invitations", ["status"])
    op.create_index("ix_invitations_created_at", "invitations", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_invitations_created_at", table_name="invitations")
    op.drop_index("ix_invitations_status", table_name="invitations")
    op.drop_index("ix_invitations_token_expires_at", table_name="invitations")
    op.drop_index("ix_invitations_token_hash", table_name="invitations")
    op.drop_index("ix_invitations_invitee_email", table_name="invitations")
    op.drop_index("ix_invitations_invitee_phone", table_name="invitations")
    op.drop_index("ix_invitations_invitee_user_id", table_name="invitations")
    op.drop_index("ix_invitations_inviter_id", table_name="invitations")
    op.drop_index("ix_invitations_group_id", table_name="invitations")
    op.drop_table("invitations")
