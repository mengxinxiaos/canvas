from copy import deepcopy
from decimal import Decimal
import json

import pytest

from app.services import pricing


def calculate(**overrides):
    values = {
        "provider": "volcengine", "model": "doubao-seedance-2-0-260128",
        "call_type": "video_generation", "parameters": {"resolution": "720p", "has_video_input": False},
        "usage": {"total_tokens": 35800},
    }
    values.update(overrides)
    return pricing.calculate_cost(**values)


@pytest.mark.parametrize("provider", ["volcengine", "poxian"])
@pytest.mark.parametrize("has_video,rates", [
    (False, {"480p": "46", "720p": "46", "1080p": "51", "4K": "26"}),
    (True, {"480p": "28", "720p": "28", "1080p": "31", "4K": "16"}),
])
def test_seedance_rates_use_actual_total_tokens(provider, has_video, rates):
    for resolution, rate in rates.items():
        result = calculate(provider=provider, parameters={"resolution": resolution, "has_video_input": has_video})
        assert result["cost"] == format(Decimal(35800) / Decimal(1000000) * Decimal(rate), "f")
        assert result["currency"] == "CNY"
        assert result["cost_status"] == "calculated"
        snapshot = result["pricing_snapshot"]
        assert snapshot["rate_per_million_tokens"] == rate
        assert snapshot["has_video_input"] is has_video
        assert snapshot["source"] == "user_config"
        assert snapshot["rule"]["rates"]["with_video"]["1080p"] == "31"
        assert len(snapshot["policy_hash"]) == 64


@pytest.mark.parametrize("provider", ["zhenzhen", "zhenzhen-gpt", "zhenzhen-gemini"])
def test_zhenzhen_multiplier_applies_once_to_raw_amount(provider):
    raw = "0.12345678901234567890123456789"
    result = calculate(provider=provider, provider_cost=raw, provider_currency="credits")
    assert result["cost"] == "0.1666666651666666665166666666515"
    assert result["currency"] == "CNY"
    assert result["pricing_snapshot"]["provider_cost"] == raw
    assert result["pricing_snapshot"]["provider_currency"] == "credits"
    # Repeated finalization always starts with the saved raw supplier amount.
    again = calculate(provider=provider, provider_cost=raw, rule_snapshot=result["pricing_snapshot"])
    assert again["cost"] == result["cost"]


def test_real_zero_cost_and_zero_tokens_remain_zero():
    assert Decimal(calculate(provider="zhenzhen", provider_cost=0)["cost"]) == 0
    result = calculate(usage={"total_tokens": 0})
    assert Decimal(result["cost"]) == 0
    assert result["cost_status"] == "calculated"


@pytest.mark.parametrize("value", [True, False, -1, 1.5, "3.5", "NaN", "Infinity", "1e99999"])
def test_invalid_token_counts_never_produce_a_price(value):
    result = calculate(usage={"total_tokens": value})
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "invalid_total_tokens"


def test_completion_tokens_are_not_a_fallback_and_not_added_to_total():
    assert calculate(usage={"completion_tokens": 35800})["cost"] is None
    assert calculate(usage={"total_tokens": 35800, "completion_tokens": 35800})["cost"] == "1.6468"


@pytest.mark.parametrize("parameters,reason", [
    ({"has_video_input": False}, "missing_resolution"),
    ({"resolution": "720p"}, "missing_video_input_presence"),
    ({"resolution": "720p", "has_video_input": "false"}, "missing_video_input_presence"),
    ({"resolution": "720p", "has_video_input": 0}, "missing_video_input_presence"),
    ({"resolution": "8K", "has_video_input": False}, "unsupported_resolution"),
])
def test_missing_or_unrecognized_parameters_remain_unpriced(parameters, reason):
    result = calculate(parameters=parameters)
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == reason


@pytest.mark.parametrize("model", ["doubao-seedance-2-5-270101", "seedance-1-5-pro-251215", "doubao-seedance-2-0-fast-260128", "ep-unknown"])
def test_other_versions_do_not_inherit_seedance2_price(model):
    result = calculate(model=model)
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "unknown_model"


def test_poxian_known_endpoint_alias_is_configured_not_hardcoded():
    result = calculate(provider="poxian", model="poxian-ep-20260414170324-klrk5")
    assert result["cost"] == "1.6468"
    assert result["pricing_snapshot"]["model_match_basis"] == "requested_alias"
    assert calculate(provider="volcengine", model="ep-20260414170324-klrk5")["cost"] is None


def test_actual_model_can_resolve_unknown_endpoint_but_cannot_inherit_wrong_version():
    first = calculate(provider="poxian", model="ep-unknown", usage={})
    assert first["cost"] is None
    final = calculate(provider="poxian", model="ep-unknown", billing_model="doubao-seedance-2-0-260128", rule_snapshot=first["pricing_snapshot"])
    assert final["cost"] == "1.6468"
    assert final["pricing_snapshot"]["model_match_basis"] == "billing_model"
    for actual in ("doubao-seedance-2-5-270101", "doubao-seedance-1-5-pro-251215", "seedance-2-0-fast-260128"):
        result = calculate(billing_model=actual)
        assert result["cost"] is None
        assert result["pricing_snapshot"]["reason"] == "model_conflict"


def test_unmatched_call_resolves_final_model_against_frozen_policy(monkeypatch):
    first = calculate(provider="poxian", model="ep-unknown", usage={})
    frozen = first["pricing_snapshot"]
    assert frozen["policy"]["version"] == frozen["rule_version"]
    assert "rule" not in frozen
    def load_must_not_run():
        raise AssertionError("Unmatched in-flight calls cannot consult changed policy")
    monkeypatch.setattr(pricing, "load_pricing_rules", load_must_not_run)
    final = calculate(provider="poxian", model="ep-unknown", billing_model="doubao-seedance-2-0-260128", rule_snapshot=frozen)
    assert final["cost"] == "1.6468"
    assert final["pricing_snapshot"]["policy_hash"] == frozen["policy_hash"]
    assert final["pricing_snapshot"]["rule"]["rates"]["without_video"]["720p"] == "46"


def test_new_model_rule_does_not_retroactively_price_unmatched_calls(monkeypatch):
    old = calculate(model="doubao-seedance-2-5-270101", usage={})
    policy = deepcopy(pricing.load_pricing_rules())
    new_rule = deepcopy(policy["rules"][1])
    new_rule.update(id="seedance-2.5-test", model_patterns=["^(?:doubao-)?seedance-2-5-[0-9]{6}$"], model_aliases={})
    new_rule["rates"]["without_video"]["720p"] = "80"
    policy["rules"].append(new_rule)
    policy["version"] = "future-test-v2"
    monkeypatch.setattr(pricing, "load_pricing_rules", lambda: policy)
    existing = calculate(model="doubao-seedance-2-5-270101", rule_snapshot=old["pricing_snapshot"])
    assert existing["cost"] is None
    assert existing["pricing_snapshot"]["rule_version"] == old["pricing_snapshot"]["rule_version"]
    assert calculate(model="doubao-seedance-2-5-270101")["cost"] == "2.8640"


def test_opaque_actual_endpoint_can_use_explicit_requested_alias():
    result = calculate(provider="poxian", model="ep-20260414170324-klrk5", billing_model="ep-opaque")
    assert result["cost"] == "1.6468"


def test_entire_rule_freezes_but_final_input_selects_correct_branch(monkeypatch):
    begun = calculate(usage={}, parameters={"resolution": "720p", "has_video_input": False})
    assert begun["cost"] is None
    frozen = begun["pricing_snapshot"]
    assert frozen["rule"]["rates"]["with_video"]["1080p"] == "31"
    def load_must_not_run():
        raise AssertionError("Active calls cannot consult edited live policy")
    monkeypatch.setattr(pricing, "load_pricing_rules", load_must_not_run)
    final = calculate(parameters={"resolution": "1080p", "has_video_input": True}, rule_snapshot=frozen)
    assert final["cost"] == "1.1098"
    assert final["pricing_snapshot"]["rate_per_million_tokens"] == "31"
    assert final["pricing_snapshot"]["policy_hash"] == frozen["policy_hash"]
    assert "reason" not in final["pricing_snapshot"]
    assert calculate(billing_model="doubao-seedance-2-5-270101", rule_snapshot=frozen)["cost"] is None


def test_multiplier_is_frozen_before_final_cost_is_known(monkeypatch):
    begun = calculate(provider="zhenzhen", provider_cost=None)
    policy = deepcopy(pricing.load_pricing_rules())
    policy["rules"][0]["multiplier"] = "99"
    monkeypatch.setattr(pricing, "load_pricing_rules", lambda: policy)
    assert calculate(provider="zhenzhen", provider_cost="2", rule_snapshot=begun["pricing_snapshot"])["cost"] == "2.70"
    assert calculate(provider="zhenzhen", provider_cost="2")["cost"] == "198"


def test_new_model_rule_can_be_added_by_configuration_only(tmp_path, monkeypatch):
    policy = deepcopy(pricing.load_pricing_rules())
    new_rule = deepcopy(policy["rules"][1])
    new_rule.update(id="seedance-2.5-test", model_patterns=["^(?:doubao-)?seedance-2-5-[0-9]{6}$"], model_aliases={})
    new_rule["rates"]["without_video"]["720p"] = "80"
    policy["rules"].append(new_rule)
    policy["version"] = "future-test-v2"
    file = tmp_path / "policy.json"
    file.write_text(json.dumps(policy))
    monkeypatch.setenv("API_COST_PRICING_RULES_FILE", str(file))
    result = calculate(model="doubao-seedance-2-5-270101")
    assert result["cost"] == "2.8640"
    assert result["pricing_snapshot"]["rule_id"] == "seedance-2.5-test"
    assert result["pricing_snapshot"]["rule_version"] == "future-test-v2"


@pytest.mark.parametrize("provider", ["minimax", "ali", "aliyun"])
def test_deferred_providers_are_never_priced(provider):
    result = calculate(provider=provider, provider_cost=100, provider_currency="CNY")
    assert result["cost"] is None
    assert result["cost_status"] == "not_supported"


def test_unconfigured_provider_can_pass_through_explicit_cost_only():
    result = calculate(provider="other", provider_cost="0.123", provider_currency="USD")
    assert result["cost"] == "0.123"
    assert result["currency"] == "USD"
    assert result["cost_status"] == "reported"
    assert calculate(provider="other")["cost"] is None


def test_older_video_and_image_models_are_not_priced_as_seedance2():
    assert calculate(model="seedance-1-5-pro-251215")["cost"] is None
    assert calculate(call_type="image_generation", provider_cost="3")["cost"] is None


def test_missing_and_invalid_supplier_costs_do_not_become_zero():
    assert calculate(provider="zhenzhen")["pricing_snapshot"]["reason"] == "missing_provider_cost"
    for cost in (True, -2, "NaN", "Infinity", "bad"):
        result = calculate(provider="zhenzhen", provider_cost=cost)
        assert result["cost"] is None
        assert result["pricing_snapshot"]["reason"] == "invalid_provider_cost"


def test_malformed_configuration_does_not_guess_a_price(tmp_path, monkeypatch):
    path = tmp_path / "invalid.json"
    path.write_text("{bad json")
    monkeypatch.setenv("API_COST_PRICING_RULES_FILE", str(path))
    result = calculate()
    assert result["cost"] is None
    assert result["pricing_snapshot"]["reason"] == "invalid_pricing_config"
