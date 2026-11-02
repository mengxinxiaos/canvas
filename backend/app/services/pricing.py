"""Versioned user-defined cost policies, independent of providers and persistence.

`cost` is the calculated CNY amount for the configured suppliers. The caller
must retain provider_cost separately and pass that raw amount on every update;
never feed a previously calculated amount back as provider_cost.

New calls freeze the full catalogue, so an actual model disclosed only after
submission can select its specific rule without consulting later prices.
Legacy snapshots containing only a selected rule remain supported.
"""
from copy import deepcopy
from decimal import Decimal, InvalidOperation, localcontext
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any


DEFAULT_RULES_FILE = Path(__file__).resolve().parents[1] / "core" / "pricing_rules.json"
UNSUPPORTED_PROVIDERS = frozenset({"minimax", "ali", "aliyun"})


def _decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        return None
    text = str(value).strip()
    if not text or len(text) > 128:
        return None
    try:
        number = Decimal(text)
    except (InvalidOperation, ValueError):
        return None
    if not number.is_finite() or number < 0:
        return None
    if number.adjusted() > 60 or not -60 <= number.as_tuple().exponent <= 60:
        return None
    return number


def _text(value: Any, limit: int = 256) -> str | None:
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def _normalized_model(value: Any, provider: str) -> str:
    model = str(value or "").strip().lower()
    prefix = f"{provider}-"
    return model[len(prefix):] if model.startswith(prefix) else model


def load_pricing_rules() -> dict:
    """Read configuration for new calls; active calls use their saved snapshot."""
    path = Path(os.environ.get("API_COST_PRICING_RULES_FILE") or DEFAULT_RULES_FILE)
    with path.open(encoding="utf-8") as source:
        policy = json.load(source, parse_float=Decimal)
    if not isinstance(policy, dict) or policy.get("schema_version") != 1:
        raise ValueError("Unsupported pricing configuration schema")
    if not isinstance(policy.get("version"), str) or not isinstance(policy.get("rules"), list):
        raise ValueError("Invalid pricing configuration")
    # Price values should be JSON strings. Keep a serializable canonical copy
    # even if a local configuration author wrote a decimal as a JSON number.
    policy = json.loads(json.dumps(policy, default=str))
    canonical = json.dumps(policy, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    policy["policy_hash"] = hashlib.sha256(canonical.encode()).hexdigest()
    return policy


def _match_model(rule: dict, model: str, provider: str) -> str | None:
    aliases = rule.get("model_aliases", {}).get(provider, [])
    if model in {_normalized_model(alias, provider) for alias in aliases}:
        return "alias"
    if model in {_normalized_model(value, provider) for value in rule.get("models", [])}:
        return "model"
    for pattern in rule.get("model_patterns", []):
        if re.fullmatch(pattern, model):
            return "model"
    return None


def _has_model_selector(rule: dict) -> bool:
    return bool(rule.get("models") or rule.get("model_patterns") or rule.get("model_aliases"))


def _validate_matchers(rule: dict) -> None:
    for name in ("providers", "call_types", "models", "model_patterns"):
        values = rule.get(name, [])
        if not isinstance(values, list) or any(not isinstance(value, str) or not value.strip() for value in values):
            raise ValueError(f"Invalid rule {name}")
    if not rule.get("providers"):
        raise ValueError("Rule has no provider")
    aliases = rule.get("model_aliases", {})
    if not isinstance(aliases, dict):
        raise ValueError("Invalid model aliases")
    for provider, values in aliases.items():
        if (not isinstance(provider, str) or not isinstance(values, list)
                or any(not isinstance(value, str) or not value.strip() for value in values)):
            raise ValueError("Invalid model aliases")


def _model_selection(rule: dict, provider: str, model: Any, billing_model: Any) -> tuple[str | None, str | None]:
    requested = _normalized_model(model, provider)
    actual = _normalized_model(billing_model, provider)
    if actual:
        if _match_model(rule, actual, provider):
            return actual, "billing_model"
        # An endpoint identifier carries no model identity; the known requested
        # model can still identify it. A real model name cannot be overridden.
        if not actual.startswith("ep-"):
            return None, "model_conflict" if _match_model(rule, requested, provider) else "unknown_model"
    matched = _match_model(rule, requested, provider)
    if matched:
        return requested, "requested_alias" if matched == "alias" else "requested_model"
    return None, "unknown_model"


def _base_snapshot(provider: str, model: Any, billing_model: Any) -> dict:
    return {
        "schema_version": 1,
        "provider": provider,
        "requested_model": _text(model),
        "billing_model": _text(billing_model),
    }


def _result(snapshot: dict, *, cost: Decimal | None = None, currency: str | None = None,
            status: str = "unavailable", reason: str | None = None) -> dict:
    if reason:
        snapshot["reason"] = reason
    else:
        snapshot.pop("reason", None)
    return {
        "cost": format(cost, "f") if cost is not None else None,
        "currency": currency if cost is not None else None,
        "cost_status": status,
        "pricing_snapshot": snapshot,
    }


def _select_rule(policy: dict, provider: str, model: Any, billing_model: Any, call_type: str):
    active = []
    for rule in policy["rules"]:
        if not isinstance(rule, dict) or not isinstance(rule.get("enabled", True), bool):
            raise ValueError("Invalid pricing rule")
        if rule.get("enabled", True) is False:
            continue
        _validate_matchers(rule)
        active.append(rule)
    provider_rules = [rule for rule in active if provider in rule["providers"]]
    type_rules = [r for r in provider_rules if not r.get("call_types") or call_type in r["call_types"]]
    matches = []
    model_reason = "unknown_model"
    for rule in type_rules:
        if rule.get("kind") not in {"provider_multiplier", "token_rate", "unit_rate"}:
            raise ValueError("Unsupported pricing rule kind")
        if _has_model_selector(rule):
            selected, basis = _model_selection(rule, provider, model, billing_model)
            if selected:
                matches.append(((1, bool(rule.get("call_types"))), rule))
            elif basis == "model_conflict":
                model_reason = basis
        else:
            matches.append(((0, bool(rule.get("call_types"))), rule))
    if matches:
        # A model override always outranks a provider-wide fallback. Order in
        # the file must never decide which monetary rule wins.
        highest = max(score for score, _ in matches)
        winners = [rule for score, rule in matches if score == highest]
        if len(winners) > 1:
            raise ValueError("Ambiguous pricing rules")
        return winners[0], None
    if provider_rules and not type_rules:
        return None, "unsupported_call_type"
    return None, model_reason if provider_rules else "unsupported_provider"


def _path_value(values: dict, path: str) -> tuple[bool, Any]:
    node = values
    for key in path.split("."):
        if not isinstance(node, dict) or key not in node:
            return False, None
        node = node[key]
    return True, node


def _quantity(unit: str, rule: dict, parameters: dict, usage: dict) -> tuple[Decimal | None, str, str, str | None]:
    """Prefer real output; request quantities are fallback only when absent."""
    if unit == "image":
        actual_fields = ("image_count", "generated_images", "images")
        requested_fields = ("image_count", "n", "num_images")
        label = "image_count"
    elif unit == "second":
        actual_fields = ("duration_seconds", "video_seconds", "duration", "seconds")
        requested_fields = ("duration_seconds", "duration", "video_seconds", "seconds")
        label = "duration_seconds"
    else:
        field = rule.get("usage_field", "total_tokens")
        if not isinstance(field, str) or not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*", field):
            raise ValueError("Invalid token usage field")
        actual_fields = (field,)
        requested_fields = ()
        label = "token_quantity"
    for source, values, fields in (
        ("provider_response", usage, actual_fields),
        ("request_parameters", parameters, requested_fields),
    ):
        for field in fields:
            present, value = _path_value(values, field)
            if not present:
                continue
            number = _decimal(value)
            if number is None or (unit in {"image", "token"} and number != number.to_integral_value()):
                return None, source, field, f"invalid_{label}"
            return number, source, field, None
    return None, "provider_response" if unit == "token" else "request_parameters", actual_fields[0], f"missing_{label}"


def _same_selector(actual: Any, expected: Any) -> bool:
    if isinstance(expected, bool):
        return isinstance(actual, bool) and actual is expected
    if isinstance(expected, str):
        return isinstance(actual, str) and actual.strip().casefold() == expected.strip().casefold()
    if isinstance(expected, (int, float, Decimal)):
        if isinstance(actual, bool):
            return False
        left, right = _decimal(actual), _decimal(expected)
        return left is not None and right is not None and left == right
    raise ValueError("Invalid price selector")


def _unit_price(rule: dict, parameters: dict) -> tuple[Any, Any, dict | None]:
    variants = rule.get("price_variants", [])
    if not isinstance(variants, list):
        raise ValueError("Invalid price variants")
    matches = []
    for variant in variants:
        if not isinstance(variant, dict) or not isinstance(variant.get("when"), dict) or not variant["when"]:
            raise ValueError("Invalid price variant")
        conditions = variant["when"]
        if any(not isinstance(key, str) or not isinstance(value, (str, bool, int, float, Decimal))
               for key, value in conditions.items()):
            raise ValueError("Invalid price selector")
        if all(key in parameters and _same_selector(parameters[key], value) for key, value in conditions.items()):
            matches.append(variant)
    if matches:
        largest = max(len(variant["when"]) for variant in matches)
        winners = [variant for variant in matches if len(variant["when"]) == largest]
        if len(winners) != 1:
            raise ValueError("Ambiguous price variants")
        winner = winners[0]
        return winner.get("unit_price"), winner.get("unit_size", rule.get("unit_size", "1")), winner["when"]
    return rule.get("unit_price"), rule.get("unit_size", "1"), None


def _calculate_unit_rate(snapshot: dict, rule: dict, parameters: dict, usage: dict, call_type: str, currency: str) -> dict:
    unit = rule.get("unit")
    if unit not in {"image", "second", "token"}:
        raise ValueError("Unsupported pricing unit")
    snapshot.update(billing_mode="local", unit=unit, formula="quantity / unit_size * unit_price")
    if ((unit == "image" and call_type != "image_generation")
            or (unit == "second" and call_type != "video_generation")):
        return _result(snapshot, reason="unsupported_call_type")
    price_value, size_value, conditions = _unit_price(rule, parameters)
    if price_value is None and conditions is None and rule.get("price_variants"):
        return _result(snapshot, reason="no_matching_price_variant")
    price, size = _decimal(price_value), _decimal(size_value)
    if price is None or size is None or size <= 0:
        raise ValueError("Invalid unit price")
    snapshot.update(unit_price=format(price, "f"), unit_size=format(size, "f"))
    if conditions is not None:
        snapshot["price_conditions"] = deepcopy(conditions)
    quantity, source, field, reason = _quantity(unit, rule, parameters, usage)
    snapshot.update(quantity=format(quantity, "f") if quantity is not None else None,
                    quantity_source=source, quantity_field=field)
    if reason:
        return _result(snapshot, reason=reason)
    with localcontext() as context:
        context.prec = 256
        cost = quantity / size * price
    return _result(snapshot, cost=cost, currency=currency, status="calculated")


def calculate_cost(
    *, provider: str | None, model: str | None, call_type: str,
    parameters: dict | None, usage: dict | None,
    provider_cost: Any = None, provider_currency: str | None = None,
    billing_model: str | None = None, rule_snapshot: dict | None = None,
) -> dict:
    """Calculate one observation from raw supplier data and effective parameters.

    `parameters.has_video_input` must describe video actually sent upstream,
    rather than just a requested reference mode. Missing values stay unpriced.
    New snapshots freeze the whole policy; final actual-model data may resolve
    a more specific rule from that original policy without using later prices.
    """
    provider = str(provider or "default").strip().lower()
    parameters = parameters if isinstance(parameters, dict) else {}
    usage = usage if isinstance(usage, dict) else {}
    snapshot = _base_snapshot(provider, model, billing_model)
    if provider in UNSUPPORTED_PROVIDERS:
        snapshot.update(kind="unsupported", source="user_config")
        return _result(snapshot, status="not_supported", reason="unsupported_provider")

    try:
        frozen = rule_snapshot if isinstance(rule_snapshot, dict) else {}
        if (frozen.get("reason") == "invalid_pricing_config"
                and not isinstance(frozen.get("rule"), dict)
                and not isinstance(frozen.get("policy"), dict)):
            # No valid starting policy existed. Repairing configuration may
            # price new calls, but must not invent the rate for this old call.
            snapshot["source"] = frozen.get("source", "user_config")
            return _result(snapshot, reason="invalid_pricing_config")
        if isinstance(frozen.get("rule"), dict) and not isinstance(frozen.get("policy"), dict):
            if frozen.get("provider") != provider:
                return _result(snapshot, reason="model_conflict")
            rule = deepcopy(frozen["rule"])
            _validate_matchers(rule)
            for key in ("source", "rule_id", "rule_version", "policy_hash"):
                if key in frozen:
                    snapshot[key] = deepcopy(frozen[key])
            if provider not in rule.get("providers", []):
                return _result(snapshot, reason="model_conflict")
            if rule.get("call_types") and call_type not in rule["call_types"]:
                return _result(snapshot, reason="unsupported_call_type")
        else:
            if isinstance(frozen.get("policy"), dict):
                if frozen.get("provider") != provider:
                    return _result(snapshot, reason="model_conflict")
                policy = deepcopy(frozen["policy"])
                if policy.get("schema_version") != 1 or not isinstance(policy.get("rules"), list):
                    raise ValueError("Invalid frozen pricing policy")
            else:
                policy = load_pricing_rules()
            snapshot.update(source=policy.get("source", "user_config"),
                            policy_hash=policy["policy_hash"], rule_version=policy["version"],
                            policy=deepcopy(policy))
            rule, reason = _select_rule(policy, provider, model, billing_model, call_type)
            if rule is None:
                # Only configured suppliers are subject to their strict local
                # policy. Other suppliers may expose an already-priced amount.
                configured = any(provider in r.get("providers", []) and r.get("enabled", True) is not False
                                 for r in policy["rules"] if isinstance(r, dict))
                if not configured:
                    amount = _decimal(provider_cost)
                    snapshot.update(kind="provider_reported", billing_mode="provider_reported", source="provider_response", provider_cost=format(amount, "f") if amount is not None else None,
                                    provider_currency=_text(provider_currency, 32), formula="provider_cost")
                    if amount is not None:
                        return _result(snapshot, cost=amount, currency=_text(provider_currency, 32), status="reported")
                return _result(snapshot, reason=reason)
            snapshot.update(source=policy.get("source", "user_config"), rule_id=rule.get("id"), rule_version=policy["version"], policy_hash=policy["policy_hash"])

        snapshot.update(kind=rule.get("kind"), rule=deepcopy(rule))
        if _has_model_selector(rule):
            matched, basis = _model_selection(rule, provider, model, billing_model)
            if not matched:
                return _result(snapshot, reason=basis)
            snapshot.update(matched_model=matched, model_match_basis=basis)
        currency = _text(rule.get("currency"), 32)
        if not currency:
            raise ValueError("Pricing rule has no currency")
        if rule.get("kind") == "provider_multiplier":
            snapshot["billing_mode"] = "provider_reported"
            multiplier = _decimal(rule.get("multiplier"))
            if multiplier is None:
                raise ValueError("Invalid cost multiplier")
            amount = _decimal(provider_cost)
            snapshot.update(multiplier=format(multiplier, "f"), provider_cost=format(amount, "f") if amount is not None else None,
                            provider_currency=_text(provider_currency, 32), formula="provider_cost * multiplier")
            if amount is None:
                return _result(snapshot, reason="missing_provider_cost" if provider_cost is None else "invalid_provider_cost")
            with localcontext() as context:
                context.prec = 256
                calculated = amount * multiplier
            return _result(snapshot, cost=calculated, currency=currency, status="calculated")

        if rule.get("kind") == "unit_rate":
            return _calculate_unit_rate(snapshot, rule, parameters, usage, call_type, currency)

        if rule.get("kind") != "token_rate":
            raise ValueError("Unsupported pricing rule kind")
        matched, basis = _model_selection(rule, provider, model, billing_model)
        if not matched:
            return _result(snapshot, reason=basis)
        snapshot.update(matched_model=matched, model_match_basis=basis, billing_mode="local", unit="token",
                        formula="total_tokens / token_unit * rate_per_million_tokens")
        resolution = str(parameters.get("resolution") or "").strip().lower()
        snapshot["resolution"] = resolution or None
        if not resolution:
            return _result(snapshot, reason="missing_resolution")
        has_video = parameters.get("has_video_input")
        snapshot["has_video_input"] = has_video if isinstance(has_video, bool) else None
        if not isinstance(has_video, bool):
            return _result(snapshot, reason="missing_video_input_presence")
        branch = "with_video" if has_video else "without_video"
        rate_table = rule.get("rates", {})
        if not isinstance(rate_table, dict):
            raise ValueError("Invalid token rate table")
        rates = rate_table.get(branch, {})
        if not isinstance(rates, dict):
            raise ValueError("Invalid token rates")
        if resolution not in rates:
            return _result(snapshot, reason="unsupported_resolution")
        rate = _decimal(rates[resolution])
        unit = _decimal(rule.get("token_unit"))
        if rate is None or unit is None or unit <= 0:
            raise ValueError("Invalid token price")
        snapshot.update(rate_per_million_tokens=format(rate, "f"), token_unit=format(unit, "f"),
                        unit_price=format(rate, "f"), unit_size=format(unit, "f"))
        tokens = _decimal(usage.get("total_tokens"))
        snapshot["total_tokens"] = format(tokens, "f") if tokens is not None else None
        snapshot.update(quantity=snapshot["total_tokens"], quantity_source="provider_response", quantity_field="total_tokens")
        if tokens is None or tokens != tokens.to_integral_value():
            return _result(snapshot, reason="missing_total_tokens" if usage.get("total_tokens") is None else "invalid_total_tokens")
        with localcontext() as context:
            context.prec = 256
            calculated = tokens / unit * rate
        return _result(snapshot, cost=calculated, currency=currency, status="calculated")
    except (OSError, ValueError, TypeError, KeyError, re.error, InvalidOperation):
        snapshot.setdefault("source", "user_config")
        return _result(snapshot, reason="invalid_pricing_config")
