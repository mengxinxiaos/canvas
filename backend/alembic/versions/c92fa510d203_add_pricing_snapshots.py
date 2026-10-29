"""Keep supplier amounts separate from versioned locally calculated costs.

Revision ID: c92fa510d203
Revises: b81e4a30c912
"""
from alembic import op
import sqlalchemy as sa

revision = "c92fa510d203"
down_revision = "b81e4a30c912"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {c["name"] for c in sa.inspect(bind).get_columns("api_call_records")}
    for name, datatype in (
        ("provider_cost", sa.Text()), ("provider_currency", sa.String()),
        ("billing_model", sa.String()), ("pricing_snapshot", sa.JSON()),
    ):
        if name not in columns:
            op.add_column("api_call_records", sa.Column(name, datatype, nullable=True))
    # Prior records stored unconverted supplier amounts in cost. Preserve that
    # evidence, and don't label it CNY under rules introduced after the call.
    records = sa.table("api_call_records",
        sa.column("cost"), sa.column("currency"), sa.column("cost_status"),
        sa.column("provider_cost"), sa.column("provider_currency"),
        sa.column("pricing_snapshot", sa.JSON()),
    )
    bind.execute(records.update().where(records.c.pricing_snapshot.is_(None)).values(
        provider_cost=records.c.cost,
        provider_currency=records.c.currency,
        cost=None,
        currency=None,
        cost_status=sa.case(
            (records.c.cost_status == "not_supported", "not_supported"),
            (records.c.cost_status == "pending", "pending"),
            else_="unavailable",
        ),
        pricing_snapshot={"version": "legacy-unpriced", "reason": "legacy_without_pricing_rule"},
    ))


def downgrade():
    # Restore the original supplier amount semantics when returning to v1.
    bind = op.get_bind()
    bind.execute(sa.text(
        "UPDATE api_call_records SET cost=provider_cost, currency=provider_currency, "
        "cost_status=CASE WHEN provider_cost IS NOT NULL THEN 'reported' ELSE cost_status END"
    ))
    with op.batch_alter_table("api_call_records") as batch:
        batch.drop_column("pricing_snapshot")
        batch.drop_column("billing_model")
        batch.drop_column("provider_currency")
        batch.drop_column("provider_cost")
