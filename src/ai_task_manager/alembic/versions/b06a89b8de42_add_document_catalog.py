"""Add the document catalog and backfill it from owned chunks.

Revision ID: b06a89b8de42
Revises: f98c92ee1a0a
"""

import sqlalchemy as sa
from alembic import op


revision = "b06a89b8de42"
down_revision = "f98c92ee1a0a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=True),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("owner_id", "source_id", name="uq_documents_owner_source"),
    )
    # Block legacy writers while copying keys and installing the foreign key.
    op.execute("LOCK TABLE document_chunks IN SHARE ROW EXCLUSIVE MODE")
    op.execute("""
        INSERT INTO documents (owner_id, source_id)
        SELECT DISTINCT owner_id, source_id
        FROM document_chunks
        WHERE owner_id IS NOT NULL
    """)
    op.create_index(
        "ix_document_chunks_owner_source", "document_chunks", ["owner_id", "source_id"]
    )
    op.create_foreign_key(
        "fk_document_chunks_document",
        "document_chunks",
        "documents",
        ["owner_id", "source_id"],
        ["owner_id", "source_id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_document_chunks_document", "document_chunks", type_="foreignkey")
    op.drop_index("ix_document_chunks_owner_source", table_name="document_chunks")
    op.drop_table("documents")
