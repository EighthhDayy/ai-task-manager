"""Store PDF page numbers on new chunks.

Revision ID: 3c7a1f5e9b24
Revises: b06a89b8de42
"""

import sqlalchemy as sa
from alembic import op


revision = "3c7a1f5e9b24"
down_revision = "b06a89b8de42"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("document_chunks", sa.Column("page_number", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("document_chunks", "page_number")
