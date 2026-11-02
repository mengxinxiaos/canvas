"""Independent platform/model rules and the source of billable quantities."""
from copy import deepcopy
from decimal import Decimal

import pytest

from app.services import pricing


def unit_rule(unit="image", **overrides):
    result = {
        "id": f"test-{unit}", "kind": "unit_rate", "providers": ["zhenzhen"],
        "models": ["test-model"],
        "call_types": ["video_generation" if unit == "second" else "image_generation"],
        "unit": unit, "unit_price": "0.25", "unit_size": "1", "currency": "CNY",
    }
    result.update(overrides)
    return result


def use_rules(monkeypatch, *rules):
    policy = {"schema_version": 1, "version": "unit-test-v1", "source": "user_config",
              "policy_hash": "frozen-test-policy", "rules": list(rules)}
    monkeypatch.setattr(pricing, "load_pricing_rules", lambda: deepcopy(policy))
    return policy


def calculate(**overrides):
    values = {"provider": "zhenzhen", "model": "test-model", "call_type": "image_generation",
              "parameters": {"image_count": 3}, "usage": {}}
    values.update(overrides)
    return pricing.calculate_cost(**values)


@pytest.mark.parametrize("unit,call_type,usage,parameters,expected", [
    ("image", "image_generation", {"image_count": 2}, {"image_count": 3}, "0.50"),
    ("second", "video_generation", {"duration_seconds": "4.5"}, {"duration": 10}, "1.125"),
    ("token", "image_generation", {"total_tokens": 8000}, {"max_tokens": 10000}, "2000.00"),
    ("token", "video_generation", {"total_tokens": 8000}, {"duration": 10}, "2000.00"),
])
def test_units_use_actual_output(monkeypatch, unit, call_type, usage, parameters, expected):
    use_rules(monkeypatch, unit_rule(unit, call_types=[call_type]))
    result = calculate(call_type=call_type, usage=usage, parameters=parameters, provider_cost="999")
    assert result["cost"] == expected
    assert result["currency"] == "CNY"
    snapshot = result["pricing_snapshot"]
    assert snapshot["billing_mode"] == "local"
    assert snapshot["unit"] == unit
    assert snapshot["quantity_source"] == "provider_response"
    assert snapshot["formula"] == "quantity / unit_size * unit_price"


@pytest.mark.parametrize("unit,call_type,parameters,expected", [
    ("image", "image_generation", {"image_count": 3}, "0.75"),
    ("image", "image_generation", {"n": 4}, "1.00"),
    ("image", "image_generation", {"num_images": 2}, "0.50"),
    ("second", "video_generation", {"duration": "7.5"}, "1.875"),
    ("second", "video_generation", {"duration_seconds": 8}, "2.00"),
])
def test_request_quantity_is_used_only_when_response_omits_it(monkeypatch, unit, call_type, parameters, expected):
    use_rules(monkeypatch, unit_rule(unit))
    result = calculate(call_type=call_type, parameters=parameters)
    assert result["cost"] == expected
    assert result["pricing_snapshot"]["quantity_source"] == "request_parameters"


@pytest.mark.parametrize("unit,field,call_type", [
    ("image", "image_count", "image_generation"),
    ("second", "duration_seconds", "video_generation"),
    ("token", "total_tokens", "image_generation"),
])
def test_actual_zero_is_billable_zero_and_never_falls_back(monkeypatch, unit, field, call_type):
    use_rules(monkeypatch, unit_rule(unit))
    result = calculate(call_type=call_type, usage={field: 0}, parameters={field: 100, "duration": 100})
    assert Decimal(result["cost"]) == 0
    assert result["cost_status"] == "calculated"
    assert result["pricing_snapshot"]["quantity_source"] == "provider_response"


@pytest.mark.parametrize("value", [None, True, -1, "bad", "NaN", "Infinity", "1e99999", "1.5"])
def test_invalid_actual_image_count_never_uses_requested_count(monkeypatch, value):
    use_rules(monkeypatch, unit_rule())
    result = calculate(usage={"image_count": value})
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "invalid_image_count"
    assert result["pricing_snapshot"]["quantity_source"] == "provider_response"


def test_tokens_are_actual_only_not_request_budgets_or_duration(monkeypatch):
    use_rules(monkeypatch, unit_rule("token", unit_price="12", unit_size="1000000"))
    result = calculate(parameters={"total_tokens": 10000, "max_tokens": 10000, "duration": 5})
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "missing_token_quantity"
    assert calculate(usage={"total_tokens": 10000})["cost"] == "0.12"


@pytest.mark.parametrize("field,usage", [
    ("output_tokens", {"output_tokens": 2000, "total_tokens": 9000}),
    ("output_tokens_details.image_tokens", {"output_tokens_details": {"image_tokens": 2000}}),
])
def test_token_field_can_be_declared(monkeypatch, field, usage):
    use_rules(monkeypatch, unit_rule("token", usage_field=field, unit_price="10", unit_size="1000000"))
    result = calculate(usage=usage)
    assert result["cost"] == "0.020"
    assert result["pricing_snapshot"]["quantity_field"] == field


@pytest.mark.parametrize("reverse", [False, True])
def test_model_override_wins_over_provider_default_in_either_order(monkeypatch, reverse):
    fallback = {"id": "provider-default", "kind": "provider_multiplier", "providers": ["zhenzhen"],
                "multiplier": "1.35", "currency": "CNY"}
    rules = [fallback, unit_rule()]
    use_rules(monkeypatch, *(reversed(rules) if reverse else rules))
    result = calculate(provider_cost="100")
    assert result["cost"] == "0.75"
    assert result["pricing_snapshot"]["rule_id"] == "test-image"
    assert calculate(model="other-model", provider_cost="2")["cost"] == "2.70"


def test_missing_response_amount_does_not_silently_switch_to_local_calculation(monkeypatch):
    response_rule = {"id": "response-only", "kind": "provider_multiplier", "providers": ["zhenzhen"],
                     "models": ["test-model"], "multiplier": "1.35", "currency": "CNY"}
    use_rules(monkeypatch, response_rule)
    result = calculate(usage={"image_count": 3})
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "missing_provider_cost"
    assert result["pricing_snapshot"]["billing_mode"] == "provider_reported"


def test_ambiguous_model_rules_fail_without_falling_back(monkeypatch):
    use_rules(monkeypatch, unit_rule(), unit_rule(id="duplicate", unit_price="99"))
    result = calculate(provider_cost="100")
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "invalid_pricing_config"


def test_disabled_examples_never_change_price_or_validate_placeholder_amount(monkeypatch):
    disabled = unit_rule(enabled=False, unit_price="填写确认后的单价")
    fallback = {"id": "provider-default", "kind": "provider_multiplier", "providers": ["zhenzhen"],
                "multiplier": "1.35", "currency": "CNY"}
    use_rules(monkeypatch, fallback, disabled)
    assert calculate(provider_cost="2")["cost"] == "2.70"


def test_actual_model_can_select_override_from_original_frozen_catalogue(monkeypatch):
    fallback = {"id": "provider-default", "kind": "provider_multiplier", "providers": ["zhenzhen"],
                "multiplier": "1.35", "currency": "CNY"}
    use_rules(monkeypatch, fallback, unit_rule())
    first = calculate(model="ep-unknown")
    assert first["pricing_snapshot"]["rule_id"] == "provider-default"
    def no_new_prices():
        raise AssertionError("Existing calls must only consult frozen rules")
    monkeypatch.setattr(pricing, "load_pricing_rules", no_new_prices)
    final = calculate(model="ep-unknown", billing_model="test-model", provider_cost="100",
                      rule_snapshot=first["pricing_snapshot"])
    assert final["cost"] == "0.75"
    assert final["pricing_snapshot"]["rule_id"] == "test-image"


def test_edited_or_new_rules_do_not_reprice_inflight_calls(monkeypatch):
    original = unit_rule()
    policy = use_rules(monkeypatch, original)
    first = calculate(usage={})
    policy["rules"][0]["unit_price"] = "999"
    final = calculate(usage={"image_count": 2}, rule_snapshot=first["pricing_snapshot"])
    assert final["cost"] == "0.50"
    assert calculate(usage={"image_count": 2})["cost"] == "1998"


def test_legacy_rule_only_snapshot_still_freezes_amount(monkeypatch):
    use_rules(monkeypatch, unit_rule())
    first = calculate()
    frozen = first["pricing_snapshot"]
    del frozen["policy"]
    use_rules(monkeypatch, unit_rule(unit_price="999"))
    assert calculate(rule_snapshot=frozen)["cost"] == "0.75"


def test_returned_model_conflict_cannot_reuse_requested_models_unit_price(monkeypatch):
    use_rules(monkeypatch, unit_rule())
    assert calculate(billing_model="future-model")["cost"] is None


def test_response_rule_supports_exact_models_and_aliases(monkeypatch):
    rule = {"id": "specific-response", "kind": "provider_multiplier", "providers": ["zhenzhen"],
            "models": ["Test-Model"], "model_aliases": {"zhenzhen": ["ep-my-model"]},
            "multiplier": "1.35", "currency": "CNY"}
    use_rules(monkeypatch, rule)
    assert calculate(model="zhenzhen-test-model", provider_cost="2")["cost"] == "2.70"
    assert calculate(model="ep-my-model", provider_cost="2")["cost"] == "2.70"
    assert calculate(model="different", provider_cost="2")["cost"] is None


def test_price_variants_select_actual_parameters_and_most_specific_match(monkeypatch):
    variants = [
        {"when": {"resolution": "720p"}, "unit_price": "0.2"},
        {"when": {"resolution": "720p", "has_video_input": True}, "unit_price": "0.3"},
    ]
    use_rules(monkeypatch, unit_rule("second", unit_price="0.1", price_variants=variants))
    result = calculate(call_type="video_generation", parameters={"resolution": "720P", "has_video_input": True, "duration": 5})
    assert result["cost"] == "1.5"
    assert result["pricing_snapshot"]["price_conditions"] == {"resolution": "720p", "has_video_input": True}
    assert calculate(call_type="video_generation", parameters={"resolution": "1080p", "duration": 5})["cost"] == "0.5"


def test_price_variants_without_default_require_a_match(monkeypatch):
    rule = unit_rule(price_variants=[{"when": {"image_size": "2K"}, "unit_price": "0.5"}])
    del rule["unit_price"]
    use_rules(monkeypatch, rule)
    result = calculate(parameters={"image_count": 2, "image_size": "4K"})
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "no_matching_price_variant"
    assert calculate(parameters={"image_count": 2, "image_size": "2k"})["cost"] == "1.0"


def test_ambiguous_price_variants_do_not_pick_list_order(monkeypatch):
    use_rules(monkeypatch, unit_rule(price_variants=[
        {"when": {"image_size": "2K"}, "unit_price": "0.5"},
        {"when": {"aspect_ratio": "16:9"}, "unit_price": "0.8"},
    ]))
    result = calculate(parameters={"image_count": 2, "image_size": "2K", "aspect_ratio": "16:9"})
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "invalid_pricing_config"


@pytest.mark.parametrize("unit_price,unit_size", [("bad", "1"), ("1", "0"), ("-1", "1"), ("1", True)])
def test_invalid_price_never_becomes_a_free_call(monkeypatch, unit_price, unit_size):
    use_rules(monkeypatch, unit_rule(unit_price=unit_price, unit_size=unit_size))
    result = calculate()
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "invalid_pricing_config"


def test_actual_quantities_aliases_work_without_canonical_fields(monkeypatch):
    use_rules(monkeypatch, unit_rule())
    assert calculate(usage={"generated_images": 2})["cost"] == "0.50"
    use_rules(monkeypatch, unit_rule("second"))
    assert calculate(call_type="video_generation", usage={"video_seconds": "3.5"})["cost"] == "0.875"


@pytest.mark.parametrize("overrides", [
    {"model_aliases": []}, {"model_aliases": {"zhenzhen": "not-a-list"}},
    {"model_patterns": "not-a-list"}, {"models": {"bad": "type"}},
    {"enabled": "false"}, {"price_variants": [{"when": {"resolution": {}}, "unit_price": "1"}]},
])
def test_bad_nested_manual_configuration_stays_unpriced(monkeypatch, overrides):
    use_rules(monkeypatch, unit_rule(**overrides))
    result = calculate()
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "invalid_pricing_config"


@pytest.mark.parametrize("rates", [[], {"without_video": []}])
def test_bad_legacy_token_rate_table_does_not_raise(monkeypatch, rates):
    rule = {"id": "bad-rates", "kind": "token_rate", "providers": ["zhenzhen"],
            "models": ["test-model"], "token_unit": "1000000", "currency": "CNY", "rates": rates}
    use_rules(monkeypatch, rule)
    result = calculate(parameters={"resolution": "720p", "has_video_input": False}, usage={"total_tokens": 10})
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "invalid_pricing_config"


def test_fixing_invalid_starting_policy_does_not_price_existing_call(monkeypatch):
    def missing_configuration():
        raise OSError("Pricing file is unavailable")
    monkeypatch.setattr(pricing, "load_pricing_rules", missing_configuration)
    first = calculate()
    assert first["cost"] is None
    assert "policy" not in first["pricing_snapshot"]
    use_rules(monkeypatch, unit_rule())
    assert calculate(rule_snapshot=first["pricing_snapshot"])["cost"] is None
    assert calculate()["cost"] == "0.75"
