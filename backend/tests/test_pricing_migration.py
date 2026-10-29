import importlib.util
import json
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def migration():
    path = Path(__file__).parents[1] / "alembic/versions/c92fa510d203_add_pricing_snapshots.py"
    spec = importlib.util.spec_from_file_location("pricing_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_old_amounts_preserved_without_claiming_historical_rmb_prices(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    module = migration()
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE api_call_records (id TEXT PRIMARY KEY, cost TEXT, currency TEXT, cost_status TEXT)"))
        connection.execute(sa.text("INSERT INTO api_call_records VALUES ('old','0.07',NULL,'reported'), ('pending',NULL,NULL,'pending'), ('ali',NULL,NULL,'not_supported')"))
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
            module.upgrade()
        row = connection.execute(sa.text("SELECT * FROM api_call_records WHERE id='old'")).mappings().one()
        assert row["provider_cost"] == "0.07"
        assert row["cost"] is None
        assert row["currency"] is None
        assert row["cost_status"] == "unavailable"
        assert json.loads(row["pricing_snapshot"])["reason"] == "legacy_without_pricing_rule"
        statuses = dict(connection.execute(sa.text("SELECT id,cost_status FROM api_call_records")).all())
        assert statuses["pending"] == "pending"
        assert statuses["ali"] == "not_supported"
        with Operations.context(MigrationContext.configure(connection)):
            module.downgrade()
        restored = connection.execute(sa.text("SELECT cost,cost_status FROM api_call_records WHERE id='old'")).one()
        assert tuple(restored) == ("0.07", "reported")
    engine.dispose()


def test_upgrade_does_not_change_rows_with_a_saved_pricing_rule(tmp_path):
    from app.models.domain import APICall
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'current.db'}")
    with engine.begin() as connection:
        APICall.__table__.create(connection)
        connection.execute(APICall.__table__.insert().values(
            id="priced", operation_id="op", call_type="video_generation",
            provider="volcengine", model="doubao-seedance-2-0-260128", status="success",
            cost="1.6468", currency="CNY", cost_status="calculated", provider_cost=None,
            pricing_snapshot={"rule_id": "saved-rule", "rule_version": "old-version"},
            started_at=__import__("datetime").datetime(2026, 10, 27),
        ))
        with Operations.context(MigrationContext.configure(connection)):
            migration().upgrade()
        row = connection.execute(sa.text("SELECT cost,currency,pricing_snapshot FROM api_call_records WHERE id='priced'")).one()
        assert row[0] == "1.6468"
        assert row[1] == "CNY"
        assert json.loads(row[2])["rule_id"] == "saved-rule"
    engine.dispose()
