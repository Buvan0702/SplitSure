"""Add push_token to users table

Revision ID: 002
Revises: 001_initial
Create Date: 2026-04-13
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '002'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('push_token', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('users', 'push_token')
