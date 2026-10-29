"""Versioned user-defined cost policies, independent of providers and persistence.

`cost` is the calculated CNY amount for the configured suppliers. The caller
must retain provider_cost separately and pass that raw amount on every update;
never feed a previously calculated amount back as provider_cost.

Each selected rule is copied in full into its snapshot. Reusing that snapshot
freezes prices while still allowing final response inputs (tokens, resolution,
actual model) to refine the calculation. An unknown model never inherits a
nearby model's price. Adding a future model is a declarative JSON change.
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
    if model in aliases:
        return "alias"
    for pattern in rule.get("model_patterns", []):
        if re.fullmatch(pattern, model):
            return "model"
    return None


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
    provider_rules = [r for r in policy["rules"] if isinstance(r, dict) and provider in r.get("providers", [])]
    type_rules = [r for r in provider_rules if not r.get("call_types") or call_type in r["call_types"]]
    matches = []
    model_reason = "unknown_model"
    for rule in type_rules:
        if rule.get("kind") == "provider_multiplier":
            matches.append(rule)
        elif rule.get("kind") == "token_rate":
            selected, basis = _model_selection(rule, provider, model, billing_model)
            if selected:
                matches.append(rule)
            elif basis == "model_conflict":
                model_reason = basis
    if len(matches) > 1:
        raise ValueError("Ambiguous pricing rules")
    if matches:
        return matches[0], None
    if provider_rules and not type_rules:
        return None, "unsupported_call_type"
    return None, model_reason if provider_rules else "unsupported_provider"


def calculate_cost(
    *, provider: str | None, model: str | None, call_type: str,
    parameters: dict | None, usage: dict | None,
    provider_cost: Any = None, provider_currency: str | None = None,
    billing_model: str | None = None, rule_snapshot: dict | None = None,
) -> dict:
    """Calculate one observation from raw supplier data and effective parameters.

    `parameters.has_video_input` must describe video actually sent upstream,
    rather than just a requested reference mode. Missing values stay unpriced.
    A saved snapshot with a `rule` freezes the entire selected rule. A snapshot
    without a matched rule freezes the whole policy, so final actual-model data
    may resolve a rule from that original policy without consulting later prices.
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
        if isinstance(frozen.get("rule"), dict):
            if frozen.get("provider") != provider:
                return _result(snapshot, reason="model_conflict")
            rule = deepcopy(frozen["rule"])
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
            rule, reason = _select_rule(policy, provider, model, billing_model, call_type)
            if rule is None:
                snapshot.update(source=policy.get("source", "user_config"), policy_hash=policy["policy_hash"], rule_version=policy["version"])
                # A newly added model must not retroactively price an in-flight
                # unmatched call. Freeze the full catalogue while its identity
                # is unknown; final actual-model data can resolve within it.
                snapshot["policy"] = deepcopy(policy)
                # Only configured suppliers are subject to their strict local
                # policy. Other suppliers may expose an already-priced amount.
                configured = any(provider in r.get("providers", []) for r in policy["rules"] if isinstance(r, dict))
                if not configured:
                    amount = _decimal(provider_cost)
                    snapshot.update(kind="provider_reported", source="provider_response", provider_cost=format(amount, "f") if amount is not None else None,
                                    provider_currency=_text(provider_currency, 32), formula="provider_cost")
                    if amount is not None:
                        return _result(snapshot, cost=amount, currency=_text(provider_currency, 32), status="reported")
                return _result(snapshot, reason=reason)
            snapshot.update(source=policy.get("source", "user_config"), rule_id=rule.get("id"), rule_version=policy["version"], policy_hash=policy["policy_hash"])

        snapshot.update(kind=rule.get("kind"), rule=deepcopy(rule))
        currency = _text(rule.get("currency"), 32)
        if not currency:
            raise ValueError("Pricing rule has no currency")
        if rule.get("kind") == "provider_multiplier":
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

        if rule.get("kind") != "token_rate":
            raise ValueError("Unsupported pricing rule kind")
        matched, basis = _model_selection(rule, provider, model, billing_model)
        if not matched:
            return _result(snapshot, reason=basis)
        snapshot.update(matched_model=matched, model_match_basis=basis,
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
        rates = rule.get("rates", {}).get(branch, {})
        if resolution not in rates:
            return _result(snapshot, reason="unsupported_resolution")
        rate = _decimal(rates[resolution])
        unit = _decimal(rule.get("token_unit"))
        if rate is None or unit is None or unit <= 0:
            raise ValueError("Invalid token price")
        snapshot.update(rate_per_million_tokens=format(rate, "f"), token_unit=format(unit, "f"))
        tokens = _decimal(usage.get("total_tokens"))
        snapshot["total_tokens"] = format(tokens, "f") if tokens is not None else None
        if tokens is None or tokens != tokens.to_integral_value():
            return _result(snapshot, reason="missing_total_tokens" if usage.get("total_tokens") is None else "invalid_total_tokens")
        with localcontext() as context:
            context.prec = 256
            calculated = tokens / unit * rate
        return _result(snapshot, cost=calculated, currency=currency, status="calculated")
    except (OSError, ValueError, TypeError, KeyError, re.error, InvalidOperation):
        snapshot.setdefault("source", "user_config")
        return _result(snapshot, reason="invalid_pricing_config")
