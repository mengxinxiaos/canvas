from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.domain import APICall, Base, Project, User
from app.services import billing


@pytest.fixture
def billing_db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(billing, "SessionLocal", sessions)
    with sessions() as db:
        db.add(User(id="caller", username="alice", display_name="Alice"))
        db.add(Project(id="project", name="Film", owner_id="someone_else"))
        db.commit()
    yield sessions
    engine.dispose()


def start_call(**kwargs):
    return billing.begin_call(
        user_id="caller", project_id="project", provider=kwargs.pop("provider", "zhenzhen"),
        model="test-model", call_type="image_generation", **kwargs,
    )


def test_extracts_nested_response_cost_without_inferring_currency():
    result = billing.extract_billing({"data": {"data": {"cost": "0.0000001234567890123456789012345"}}}, "zhenzhen")
    assert result["cost"] == "0.0000001234567890123456789012345"
    assert result["currency"] is None
    assert result["cost_status"] == "reported"


def test_zero_is_reported_and_outermost_cost_wins():
    result = billing.extract_billing({"cost": 0, "currency": "CNY", "usage": {"cost": 4}})
    assert result["cost"] == "0"
    assert result["cost_status"] == "reported"
    assert result["currency"] == "CNY"


@pytest.mark.parametrize("value", [None, True, False, "", "NaN", "Infinity", "-0.01", -4, "1e999999", "0e-999999", {"cost": 3}])
def test_invalid_cost_is_not_zero(value):
    result = billing.extract_billing({"cost": value})
    assert result["cost"] is None
    assert result["cost_status"] == "unavailable"


@pytest.mark.parametrize("provider", ["minimax", "ali", "aliyun", "AliYun"])
def test_deferred_providers_remain_null(provider):
    result = billing.extract_billing({"cost": 5, "currency": "USD", "usage": {"total_tokens": 12}}, provider)
    assert result["cost"] is None
    assert result["currency"] is None
    assert result["cost_status"] == "not_supported"
    assert result["usage_json"] == {"total_tokens": 12}


def test_response_content_is_never_searched_for_cost():
    result = billing.extract_billing({
        "choices": [{"message": {"content": {"cost": 100}}}],
        "content": {"cost": 50},
        "usage": {"total_tokens": 17, "api_key": "secret", "prompt": "private"},
    })
    assert result["cost"] is None
    assert result["usage_json"] == {"total_tokens": 17}


def test_sdk_responses_and_nested_details():
    class Response:
        def model_dump(self, **kwargs):
            return {
                "id": "provider-request",
                "usage": {
                    "cost": {"amount": Decimal("0.12"), "currency": "USD"},
                    "prompt_tokens": 40,
                    "prompt_tokens_details": {"cached_tokens": 10, "authorization": "private"},
                },
            }
    result = billing.extract_billing(Response())
    assert result["cost"] == "0.12"
    assert result["currency"] == "USD"
    assert result["provider_request_id"] == "provider-request"
    assert result["usage_json"] == {"prompt_tokens": 40, "prompt_tokens_details": {"cached_tokens": 10}}


def test_begin_snapshots_actual_caller_and_filters_parameters(billing_db):
    call_id = start_call(parameters={"resolution": "1080p", "prompt": "private", "api_key": "secret"})
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.user_id == "caller"
        assert row.user_name == "Alice"
        assert row.project_name == "Film"
        assert row.parameters_json == {"resolution": "1080p", "image_count": 1}
        assert row.cost is None
        assert row.cost_status == "pending"


def test_reported_cost_survives_later_missing_metadata_and_local_failure(billing_db):
    call_id = start_call()
    billing.update_call(call_id, provider_request_id="remote", metadata=billing.extract_billing({"cost": "0.45"}))
    billing.finish_call(call_id, status="failed", response={"usage": {"total_tokens": 23}}, error="DownloadFailed")
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.provider_cost == "0.45"
        assert row.provider_currency is None
        assert row.cost == "0.6075"
        assert row.currency == "CNY"
        assert row.cost_status == "calculated"
        assert row.status == "failed"
        assert row.provider_request_id == "remote"
        assert row.usage_json == {"total_tokens": 23}
        assert row.completed_at is not None


def test_finish_is_idempotent_and_allows_late_billing(billing_db):
    call_id = start_call()
    billing.finish_call(call_id, status="interrupted")
    with billing_db() as db:
        initial_time = db.get(APICall, call_id).completed_at
    billing.finish_call(call_id, response={"cost": "0.07", "currency": "CNY"})
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert db.query(APICall).count() == 1
        assert row.provider_cost == "0.07"
        assert row.cost == "0.0945"
        assert row.status == "interrupted"
        assert row.completed_at == initial_time


def test_unknown_finished_cost_stays_null(billing_db):
    call_id = start_call()
    billing.finish_call(call_id, response={"usage": {"input_tokens": 300}})
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.cost is None
        assert row.cost_status == "unavailable"


def test_pending_raw_cost_is_not_counted_until_call_finishes(billing_db):
    call_id = start_call()
    metadata = billing.extract_billing({"cost": "2"}, "zhenzhen")
    billing.update_call(call_id, metadata=metadata)
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.provider_cost == "2"
        assert row.cost is None
        assert row.cost_status == "pending"
        assert row.pricing_snapshot["multiplier"] == "1.35"
    billing.finish_call(call_id, metadata=metadata)
    billing.finish_call(call_id, metadata=metadata)
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.provider_cost == "2"
        assert row.cost == "2.70"  # Never multiply an already converted amount.
        assert db.query(APICall).count() == 1


def test_video_token_pricing_uses_effective_payload_and_response_model(billing_db):
    call_id = billing.begin_call(
        user_id="caller", project_id="project", provider="poxian",
        model="ep-20260414170324-klrk5", call_type="video_generation",
        parameters={"resolution": "720p", "has_video_input": False},
    )
    metadata = billing.extract_billing({
        "model": "doubao-seedance-2-0-260128", "usage": {"completion_tokens": 35800, "total_tokens": 35800},
    })
    metadata["parameters_json"] = {"resolution": "1080p", "has_video_input": True, "video_input_count": 1}
    billing.finish_call(call_id, metadata=metadata)
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.cost == "1.1098"
        assert row.currency == "CNY"
        assert row.provider_cost is None
        assert row.billing_model == "doubao-seedance-2-0-260128"
        assert row.usage_json["total_tokens"] == 35800
        assert row.pricing_snapshot["rate_per_million_tokens"] == "31"
        assert row.pricing_snapshot["has_video_input"] is True


def test_inflight_rule_freezes_even_if_config_later_changes(billing_db, monkeypatch):
    from app.services import pricing
    call_id = start_call()
    monkeypatch.setattr(pricing, "load_pricing_rules", lambda: (_ for _ in ()).throw(OSError("config changed")))
    billing.finish_call(call_id, response={"cost": "1"})
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.cost == "1.35"
        assert row.pricing_snapshot["multiplier"] == "1.35"


def test_late_response_cannot_silently_reprice_legacy_record(billing_db):
    call_id = start_call()
    billing.finish_call(call_id)
    with billing_db() as db:
        row = db.get(APICall, call_id)
        row.pricing_snapshot = {"reason": "legacy_without_pricing_rule", "version": "legacy-unpriced"}
        row.provider_cost = "1"
        row.cost = None
        row.currency = None
        db.commit()
    billing.finish_call(call_id, response={"cost": "2"})
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.provider_cost == "2"
        assert row.cost is None
        assert row.currency is None
        assert row.pricing_snapshot["reason"] == "legacy_without_pricing_rule"


def test_deferred_provider_cannot_receive_cost_through_metadata(billing_db):
    call_id = start_call(provider="ali")
    billing.finish_call(call_id, metadata={"cost": "42", "currency": "USD", "cost_status": "reported"})
    with billing_db() as db:
        row = db.get(APICall, call_id)
        assert row.cost is None
        assert row.currency is None
        assert row.cost_status == "not_supported"


def test_context_is_reset_after_failure_and_nested_scopes():
    outer = billing.BillingContext("a", "project-a")
    inner = billing.BillingContext("b", "project-b")
    assert billing.current_billing_context.get() is None
    with billing.billing_context(outer):
        assert billing.current_billing_context.get() == outer
        with pytest.raises(RuntimeError):
            with billing.billing_context(inner):
                assert billing.current_billing_context.get() == inner
                raise RuntimeError("test")
        assert billing.current_billing_context.get() == outer
    assert billing.current_billing_context.get() is None
