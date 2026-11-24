"""expand orders with currency, promo_code, discount_cents and concurrent index

Revision ID: 002_expand_promo_currency
Revises: 001_initial_schema
Create Date: 2026-11-24
"""
from alembic import op

revision = "002_expand_promo_currency"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE orders
            ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD',
            ADD COLUMN IF NOT EXISTS promo_code TEXT,
            ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;
        """
    )

    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS idx_orders_created_at;")
    op.execute(
        """
        ALTER TABLE orders
            DROP COLUMN IF EXISTS discount_cents,
            DROP COLUMN IF EXISTS promo_code,
            DROP COLUMN IF EXISTS currency;
        """
    )

