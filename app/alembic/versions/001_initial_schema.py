"""initial schema for products and orders

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-11-21
"""
from alembic import op

revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            sku TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            price_cents INTEGER NOT NULL CHECK (price_cents > 0),
            stock INTEGER NOT NULL CHECK (stock >= 0),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id BIGSERIAL PRIMARY KEY,
            idempotency_key TEXT UNIQUE NOT NULL,
            product_id INTEGER NOT NULL REFERENCES products(id),
            customer_name TEXT NOT NULL,
            quantity INTEGER NOT NULL CHECK (quantity > 0),
            total_cents INTEGER NOT NULL CHECK (total_cents > 0),
            status TEXT NOT NULL DEFAULT 'CONFIRMED',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        INSERT INTO products (sku, name, price_cents, stock) VALUES
            ('K8S-MECH-01', 'Mechanical Keyboard (Tactile)', 12900, 100000),
            ('SRE-HOOD-02', 'Cloud Native Hoodie', 5900, 100000),
            ('NVME-2TB-03', 'Gen5 NVMe SSD 2TB', 18900, 100000),
            ('PROM-MUG-04', 'Zero-Downtime Ceramic Mug', 1900, 100000)
        ON CONFLICT (sku) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS orders;")
    op.execute("DROP TABLE IF EXISTS products;")