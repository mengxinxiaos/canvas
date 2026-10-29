from datetime import datetime
import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints.billing import router
from app.core.database import get_db
from app.core.security import create_access_token
from app.models.domain import APICall, Base, User


@pytest.fixture
def api():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        db.add_all([
            User(id="admin", username="admin", role="admin"),
            User(id="member", username="member", role="user"),
        ])
        db.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api/admin")

    def override_db():
        with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        yield client, sessions
    engine.dispose()


def auth(user="admin"):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': user})}"}


def add_call(sessions, **overrides):
    defaults = dict(
        id="call1", operation_id="op1", user_id="member", user_name="Member",
        project_id="project1", project_name="Saved project", provider="zhenzhen",
        model="image-model", call_type="image_generation", status="success",
        cost="0.100000000000000001", currency="CNY", cost_status="reported",
        started_at=datetime(2026, 10, 26, 16), completed_at=datetime(2026, 10, 26, 16, 0, 1),
        duration_ms=1000, usage_json={"image_count": 1}, parameters_json={},
    )
    with sessions() as db:
        db.add(APICall(**(defaults | overrides)))
        db.commit()


@pytest.mark.parametrize("path", ["/api/admin/api-calls", "/api/admin/api-calls/summary"])
def test_admin_only_using_actual_login_dependency(api, path):
    client, sessions = api
    add_call(sessions)
    assert client.get(path).status_code == 401
    assert client.get(path, headers=auth("member")).status_code == 403
    assert client.get(path, headers=auth()).status_code == 200
    # The server checks the current database role, not a client-side flag.
    with sessions() as db:
        db.get(User, "admin").role = "user"
        db.commit()
    assert client.get(path, headers=auth()).status_code == 403


def test_filter_pagination_and_inclusive_shanghai_dates(api):
    client, sessions = api
    add_call(sessions)
    add_call(sessions, id="call2", started_at=datetime(2026, 10, 27, 15, 59, 59, 999999))
    add_call(sessions, id="call3", started_at=datetime(2026, 10, 27, 16))
    add_call(sessions, id="call4", started_at=datetime(2026, 10, 26, 15, 59, 59))
    params = {"start_date": "2026-10-27", "end_date": "2026-10-27", "page_size": 1}
    data = client.get("/api/admin/api-calls", params=params, headers=auth()).json()["data"]
    assert data["total"] == 2
    assert data["items"][0]["id"] == "call2"
    assert data["items"][0]["cost"] == "0.100000000000000001"
    assert data["items"][0]["started_at"].endswith("Z")
    next_page = client.get("/api/admin/api-calls", params=params | {"page": 2}, headers=auth()).json()["data"]
    assert next_page["items"][0]["id"] == "call1"
    no_match = client.get("/api/admin/api-calls", params={"user_id": "other"}, headers=auth()).json()["data"]
    assert no_match["total"] == 0


def test_summary_preserves_precision_and_separates_units(api):
    client, sessions = api
    add_call(sessions)
    add_call(sessions, id="call2", cost="0.200000000000000002")
    add_call(sessions, id="call3", currency="USD", cost="2")
    add_call(sessions, id="call4", currency=None, cost="3")
    add_call(sessions, id="call5", provider="volcengine", currency=None, cost="4")
    add_call(sessions, id="call6", provider="minimax", currency=None, cost=None, cost_status="not_supported")
    add_call(sessions, id="call7", provider="volcengine", currency=None, cost=None, cost_status="unavailable")
    add_call(sessions, id="call8", currency="CNY", cost="0")
    result = client.get("/api/admin/api-calls/summary", headers=auth()).json()["data"]
    totals = {(v["currency"], v["provider"]): v["cost"] for v in result["cost_totals"]}
    assert totals == {("CNY", None): "0.300000000000000003", ("USD", None): "2", (None, "zhenzhen"): "3", (None, "volcengine"): "4"}
    assert result["total_calls"] == 8
    assert result["reported_cost_calls"] == 6
    assert result["missing_cost_calls"] == 2
    assert result["by_user"][0]["user_id"] == "member"
    assert result["by_user"][0]["calls"] == 8


def test_invalid_filters_and_limits_rejected(api):
    client, _ = api
    for params in ({"page": 0}, {"page_size": 101}, {"start_date": "bad"}, {"start_date": "2026-10-28", "end_date": "2026-10-27"}):
        assert client.get("/api/admin/api-calls", params=params, headers=auth()).status_code == 422


def test_empty_summary(api):
    client, _ = api
    data = client.get("/api/admin/api-calls/summary", headers=auth()).json()["data"]
    assert data["total_calls"] == 0
    assert data["cost_totals"] == []


def test_calculated_costs_are_included_and_raw_supplier_amount_is_separate(api):
    client, sessions = api
    add_call(sessions, cost="1.6468", currency="CNY", cost_status="calculated",
             provider="volcengine", provider_cost=None,
             pricing_snapshot={"rate_per_million_tokens": "46", "total_tokens": "35800"})
    add_call(sessions, id="call2", cost="1.35", cost_status="calculated", provider_cost="1", provider_currency=None)
    data = client.get("/api/admin/api-calls/summary", headers=auth()).json()["data"]
    assert data["cost_totals"][0]["cost"] == "2.9968"
    assert data["calculated_cost_calls"] == 2
    assert data["priced_cost_calls"] == 2
    assert data["reported_cost_calls"] == 0
    assert data["missing_cost_calls"] == 0
    items = client.get("/api/admin/api-calls", headers=auth(), params={"cost_status": "calculated"}).json()["data"]["items"]
    assert len(items) == 2
    record = next(row for row in items if row["id"] == "call2")
    assert record["provider_cost"] == "1"
    assert record["cost"] == "1.35"



def test_migration_preserves_existing_tasks_and_supports_create_all_startup(tmp_path):
    path = Path(__file__).parents[1] / "alembic/versions/b81e4a30c912_add_api_call_records.py"
    spec = importlib.util.spec_from_file_location("billing_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE tasks (id VARCHAR PRIMARY KEY, project_id VARCHAR)"))
        connection.execute(text("INSERT INTO tasks (id, project_id) VALUES ('old-task', 'old-project')"))
        # Existing application startup can create new tables before Alembic runs.
        APICall.__table__.create(connection)
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
            module.upgrade()
        columns = {c["name"] for c in inspect(connection).get_columns("tasks")}
        assert {"user_id", "api_call_id"} <= columns
        row = connection.execute(text("SELECT id,user_id,api_call_id FROM tasks")).one()
        assert tuple(row) == ("old-task", None, None)
        assert "api_call_records" in inspect(connection).get_table_names()
    engine.dispose()
