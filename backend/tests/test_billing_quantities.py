"""Actual output evidence and successful settlement for configurable unit prices."""
from copy import deepcopy
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.domain import APICall, Base
from app.services import billing, pricing


@pytest.fixture
def quantity_db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(billing, "SessionLocal", sessions)
    yield sessions
    engine.dispose()


@pytest.fixture
def unit_policy(monkeypatch):
    policy = {
        "schema_version": 1, "version": "quantity-tests", "policy_hash": "quantity-test-policy",
        "rules": [
            {
                "id": "image-local", "kind": "unit_rate", "providers": ["example"],
                "models": ["image-model"], "call_types": ["image_generation"],
                "unit": "image", "unit_price": "0.40", "unit_size": "1", "currency": "CNY",
            },
            {
                "id": "video-local", "kind": "unit_rate", "providers": ["example"],
                "models": ["video-model"], "call_types": ["video_generation"],
                "unit": "second", "unit_price": "0.25", "unit_size": "1", "currency": "CNY",
            },
            {
                "id": "reported-default", "kind": "provider_multiplier", "providers": ["reported"],
                "multiplier": "1.35", "currency": "CNY",
            },
        ],
    }
    monkeypatch.setattr(pricing, "load_pricing_rules", lambda: deepcopy(policy))
    return policy


def begin_image(**overrides):
    values = dict(user_id=None, project_id=None, provider="example", model="image-model", call_type="image_generation")
    values.update(overrides)
    return billing.begin_call(**values)


def begin_video(**overrides):
    values = dict(user_id=None, project_id=None, provider="example", model="video-model", call_type="video_generation", parameters={"duration": 5})
    values.update(overrides)
    return billing.begin_call(**values)


def test_nested_actual_duration_and_model_are_normalized():
    metadata = billing.extract_billing({"data": {"model": "video-actual", "output": {"duration": "7.5"}}})
    assert metadata["usage_json"] == {"duration": "7.5", "duration_seconds": "7.5"}
    assert metadata["billing_model"] == "video-actual"


def test_explicit_usage_zero_is_actual_evidence():
    metadata = billing.extract_billing({"usage": {"image_count": 0, "duration_seconds": 0}})
    assert metadata["usage_json"]["image_count"] == 0
    assert metadata["usage_json"]["duration_seconds"] == 0


@pytest.mark.parametrize("field", ["images", "generated_images"])
def test_explicit_empty_image_output_array_is_zero(field):
    metadata = billing.extract_billing({"output": {field: []}})
    assert metadata["usage_json"]["image_count"] == 0


@pytest.mark.parametrize("field", ["image_count", "duration", "duration_seconds", "total_tokens"])
@pytest.mark.parametrize("value", [False, "NaN", -1, "1e999999", {"prompt": "private"}])
def test_invalid_actual_quantity_is_a_bounded_sentinel(field, value):
    metadata = billing.extract_billing({"usage": {field: value}})
    assert metadata["usage_json"][field] is None
    assert "private" not in str(metadata)


def test_counts_only_recognizable_successful_image_outputs():
    metadata = billing.extract_billing({"data": [
        {"url": "https://example.invalid/result.png"},
        {"b64_json": "private-image-bytes"},
        {"error": {"message": "generation failed"}},
    ]})
    assert metadata["usage_json"]["image_count"] == 2
    assert "result.png" not in str(metadata)
    assert "private-image-bytes" not in str(metadata)


def test_does_not_count_input_references_chat_content_or_videos():
    metadata = billing.extract_billing({
        "input_images": [{"url": "https://example.invalid/input.png"}],
        "request": {"images": [{"url": "https://example.invalid/reference.png"}]},
        "content": {"images": [{"url": "https://example.invalid/another.png"}]},
        "data": [{"type": "video", "url": "https://example.invalid/video.mp4"}],
    })
    assert "image_count" not in metadata["usage_json"]


def test_explicit_actual_count_takes_precedence_over_inferred_list():
    metadata = billing.extract_billing({
        "data": [{"url": "https://example.invalid/result.png"}],
        "usage": {"image_count": 3},
    })
    assert metadata["usage_json"]["image_count"] == 3


def test_single_image_request_gets_fallback_but_does_not_settle_early(quantity_db, unit_policy):
    call_id = begin_image()
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert row.parameters_json["image_count"] == 1
        assert row.usage_json == {}
        assert row.cost is None
        assert row.cost_status == "pending"


def test_explicit_requested_count_is_not_overridden_by_single_image_default(quantity_db, unit_policy):
    call_id = begin_image(parameters={"n": 3})
    billing.finish_call(call_id)
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert row.parameters_json == {"n": 3}
        assert Decimal(row.cost) == Decimal("1.20")
        assert row.pricing_snapshot["quantity_source"] == "request_parameters"


def test_actual_image_count_wins_over_requested_and_raw_cost(quantity_db, unit_policy):
    call_id = begin_image(parameters={"image_count": 1})
    billing.finish_call(call_id, response={"cost": "99", "usage": {"image_count": 2}})
    billing.finish_call(call_id)
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert Decimal(row.cost) == Decimal("0.80")
        assert row.provider_cost == "99"
        assert row.parameters_json["image_count"] == 1
        assert row.usage_json["image_count"] == 2
        assert row.pricing_snapshot["quantity_source"] == "provider_response"
        assert db.query(APICall).count() == 1


def test_actual_video_duration_wins_without_replacing_requested_duration(quantity_db, unit_policy):
    call_id = begin_video()
    billing.finish_call(call_id, response={"output": {"duration": "7.5"}})
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert row.parameters_json["duration"] == 5
        assert row.usage_json["duration_seconds"] == "7.5"
        assert Decimal(row.cost) == Decimal("1.875")
        assert row.pricing_snapshot["quantity_source"] == "provider_response"


@pytest.mark.parametrize("kind,expected", [("image", "0.40"), ("video", "1.25")])
def test_successful_call_falls_back_to_requested_quantity(quantity_db, unit_policy, kind, expected):
    call_id = begin_image() if kind == "image" else begin_video()
    billing.finish_call(call_id)
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert Decimal(row.cost) == Decimal(expected)
        assert row.pricing_snapshot["quantity_source"] == "request_parameters"


@pytest.mark.parametrize("status", ["failed", "interrupted"])
@pytest.mark.parametrize("kind", ["image", "video"])
def test_local_prices_never_settle_unsuccessful_calls(quantity_db, unit_policy, status, kind):
    call_id = begin_image() if kind == "image" else begin_video()
    billing.finish_call(call_id, status=status, response={"cost": "99"})
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert row.cost is None
        assert row.currency is None
        assert row.cost_status == "unavailable"
        assert row.provider_cost == "99"
        assert row.pricing_snapshot["reason"] == "call_not_successful"


def test_reported_mode_without_amount_does_not_fall_back_to_quantity(quantity_db, unit_policy):
    call_id = begin_image(provider="reported", parameters={"image_count": 3})
    billing.finish_call(call_id, response={"usage": {"image_count": 2}})
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert row.cost is None
        assert row.cost_status == "unavailable"
        assert row.pricing_snapshot["reason"] == "missing_provider_cost"


def test_reported_raw_evidence_on_failure_preserves_previous_behavior(quantity_db, unit_policy):
    call_id = begin_image(provider="reported")
    billing.finish_call(call_id, status="failed", response={"cost": "2"})
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert Decimal(row.cost) == Decimal("2.70")
        assert row.provider_cost == "2"


def test_inflight_local_rule_is_frozen_until_actual_quantity_arrives(quantity_db, unit_policy):
    call_id = begin_image()
    unit_policy["rules"][0]["unit_price"] = "99"
    billing.finish_call(call_id, response={"usage": {"image_count": 2}})
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert Decimal(row.cost) == Decimal("0.80")


def test_invalid_actual_quantity_cannot_be_hidden_by_request_fallback(quantity_db, unit_policy):
    call_id = begin_image()
    billing.finish_call(call_id, response={"usage": {"image_count": "NaN"}})
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert row.usage_json["image_count"] is None
        assert row.cost is None
        assert row.cost_status == "unavailable"


def test_actual_metadata_alias_updates_replace_earlier_observation(quantity_db, unit_policy):
    call_id = begin_video()
    billing.update_call(call_id, metadata={"usage_json": {"duration": 7}})
    billing.finish_call(call_id, metadata={"usage_json": {"duration": 8}})
    with quantity_db() as db:
        row = db.get(APICall, call_id)
        assert row.usage_json["duration_seconds"] == 8
        assert Decimal(row.cost) == Decimal("2.00")
