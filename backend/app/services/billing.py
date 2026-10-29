"""Preserve supplier evidence and calculate costs with versioned pricing rules.

Extraction always returns raw supplier metadata. Conversion happens once at
persistence, keeping supplier amounts and normalized amounts in separate fields.
"""

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterator
import re
import uuid

from app.core.database import SessionLocal
from app.models.domain import APICall, Project, User
from app.services.pricing import calculate_cost


UNSUPPORTED_PROVIDERS = frozenset({"minimax", "ali", "aliyun"})
_ENVELOPES = ("data", "result", "output", "usage", "billing", "cost_details")
_USAGE_FIELDS = frozenset({
    "prompt_tokens", "completion_tokens", "total_tokens", "input_tokens",
    "output_tokens", "cached_tokens", "cache_read_input_tokens",
    "cache_creation_input_tokens", "reasoning_tokens", "image_tokens",
    "text_tokens", "audio_tokens", "image_count", "images", "generated_images",
    "video_count", "duration", "duration_seconds", "video_seconds", "seconds",
    "input_tokens_details", "output_tokens_details", "prompt_tokens_details",
    "completion_tokens_details", "successful_requests",
})
_PARAMETER_FIELDS = frozenset({
    "mode", "aspectRatio", "aspect_ratio", "imageSize", "image_size",
    "duration", "resolution", "ratio", "max_tokens", "stream", "image_count",
    "purpose", "attempt",
    "has_video_input", "video_input_count",
})


def _now() -> datetime:
    # Existing models use naive timestamps; consistently store naive UTC.
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass(frozen=True)
class BillingContext:
    user_id: str | None
    project_id: str | None
    operation_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    conversation_id: str | None = None
    node_id: str | None = None


current_billing_context: ContextVar[BillingContext | None] = ContextVar(
    "current_billing_context", default=None,
)


@contextmanager
def billing_context(context: BillingContext) -> Iterator[BillingContext]:
    token = current_billing_context.set(context)
    try:
        yield context
    finally:
        current_billing_context.reset(token)


def _as_dict(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump(exclude_none=True)
        return dumped if isinstance(dumped, dict) else {}
    return {}


def _amount(value: Any) -> str | None:
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
    # Bound hostile exponent strings before expanding them. Never round money.
    if number.adjusted() > 60 or number.as_tuple().exponent < -60:
        return None
    return format(number, "f")


def _unit(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or len(value) > 32 or not re.fullmatch(r"[\w ./$¥€£-]+", value):
        return None
    return value


def _response_nodes(response: Any) -> list[tuple[dict, str | None]]:
    """Traverse protocol envelopes only, never prompts/content/tool arguments."""
    root = _as_dict(response)
    queue = [(root, None, 0)]
    result = []
    seen = set()
    while queue:
        node, inherited_unit, depth = queue.pop(0)
        if id(node) in seen or depth > 6:
            continue
        seen.add(id(node))
        unit = _unit(node.get("currency")) or _unit(node.get("cost_currency")) or inherited_unit
        result.append((node, unit))
        for key in _ENVELOPES:
            child = _as_dict(node.get(key))
            if child:
                queue.append((child, unit, depth + 1))
    return result


def _safe_usage(node: dict) -> dict:
    result = {}
    for key, value in node.items():
        if key not in _USAGE_FIELDS:
            continue
        if isinstance(value, dict):
            nested = _safe_usage(value)
            if nested:
                result[key] = nested
        elif not isinstance(value, bool) and isinstance(value, (int, float, Decimal, str)):
            number = _amount(value)
            if number is not None:
                # Preserve exact decimal strings; don't introduce binary float conversion.
                result[key] = value if isinstance(value, int) else number
    return result


def extract_billing(response: Any, provider: str | None = None) -> dict:
    """Normalize explicit cost/usage fields from a raw dict or SDK response.

    No totals are computed from nested items. The outermost valid cost wins.
    MiniMax and Aliyun are deliberately excluded from cost collection.
    """
    nodes = _response_nodes(response)
    cost = None
    currency = None
    request_id = None
    usage = {}
    for node, inherited_unit in nodes:
        if request_id is None:
            for key in ("request_id", "requestId", "task_id", "taskId", "id"):
                candidate = node.get(key)
                if isinstance(candidate, (str, int)) and not isinstance(candidate, bool):
                    request_id = str(candidate)[:512]
                    break
        usage.update(_safe_usage(node))
        if cost is None:
            raw_cost = node.get("cost")
            candidate = _amount(raw_cost)
            candidate_unit = inherited_unit
            if isinstance(raw_cost, dict):
                candidate = _amount(raw_cost.get("amount"))
                candidate_unit = _unit(raw_cost.get("currency")) or candidate_unit
            if candidate is not None:
                cost = candidate
                currency = candidate_unit
    unsupported = str(provider or "").strip().lower() in UNSUPPORTED_PROVIDERS
    return {
        "cost": None if unsupported else cost,
        "currency": None if unsupported else currency,
        "cost_status": "not_supported" if unsupported else ("reported" if cost is not None else "unavailable"),
        "usage_json": usage,
        "provider_request_id": request_id,
        "billing_model": str(_as_dict(response).get("model") or "")[:512] or None,
    }


def _safe_parameters(parameters: dict | None) -> dict:
    return {
        key: value[:128] if isinstance(value, str) else value
        for key, value in (parameters or {}).items()
        if key in _PARAMETER_FIELDS and isinstance(value, (str, int, bool, float))
    }


def begin_call(
    *, user_id: str | None, project_id: str | None, provider: str | None,
    model: str | None, call_type: str, operation_id: str | None = None,
    node_id: str | None = None, task_id: str | None = None,
    conversation_id: str | None = None, parameters: dict | None = None,
) -> str:
    """Create one observable API attempt using a short database transaction."""
    db = SessionLocal()
    try:
        user = db.get(User, user_id) if user_id else None
        project = db.get(Project, project_id) if project_id else None
        call_id = uuid.uuid4().hex
        unsupported = str(provider or "").strip().lower() in UNSUPPORTED_PROVIDERS
        row = APICall(
            id=call_id,
            operation_id=operation_id or uuid.uuid4().hex,
            user_id=user_id,
            user_name=(user.display_name or user.username) if user else None,
            project_id=project_id,
            project_name=project.name if project else None,
            node_id=node_id,
            task_id=task_id,
            conversation_id=conversation_id,
            call_type=call_type,
            provider=provider or "default",
            model=model or "unknown",
            status="started",
            cost=None,
            currency=None,
            cost_status="not_supported" if unsupported else "pending",
            usage_json={},
            parameters_json=_safe_parameters(parameters),
            started_at=_now(),
        )
        _refresh_pricing(row)
        db.add(row)
        db.commit()
        return call_id
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _merge_metadata(row: APICall, metadata: dict | None) -> None:
    metadata = metadata or {}
    if isinstance(metadata.get("usage_json"), dict):
        usage = dict(row.usage_json or {})
        usage.update(_safe_usage(metadata["usage_json"]))
        row.usage_json = usage
    request_id = metadata.get("provider_request_id")
    if request_id is not None:
        row.provider_request_id = str(request_id)[:512]
    if metadata.get("billing_model"):
        row.billing_model = str(metadata["billing_model"])[:512]
    if isinstance(metadata.get("parameters_json"), dict):
        row.parameters_json = {
            **(row.parameters_json or {}),
            **_safe_parameters(metadata["parameters_json"]),
        }
    if str(row.provider or "").strip().lower() in UNSUPPORTED_PROVIDERS:
        row.provider_cost = None
        row.provider_currency = None
        return
    # metadata.cost is always the supplier amount, never an already converted
    # value. Repeated updates therefore cannot multiply a cost by 1.35 twice.
    cost = _amount(metadata.get("cost"))
    if cost is not None:
        row.provider_cost = cost
        row.provider_currency = _unit(metadata.get("currency")) or row.provider_currency


def _refresh_pricing(row: APICall) -> None:
    if (row.pricing_snapshot or {}).get("reason") == "legacy_without_pricing_rule":
        # A duplicate or late response must not apply today's rates to a call
        # whose original policy was never stored. Preserve the raw evidence.
        row.cost = None
        row.currency = None
        row.cost_status = (
            "not_supported" if row.provider in UNSUPPORTED_PROVIDERS
            else "pending" if row.completed_at is None else "unavailable"
        )
        return
    result = calculate_cost(
        provider=row.provider,
        model=row.model,
        call_type=row.call_type,
        parameters=row.parameters_json or {},
        usage=row.usage_json or {},
        provider_cost=row.provider_cost,
        provider_currency=row.provider_currency,
        billing_model=row.billing_model,
        rule_snapshot=row.pricing_snapshot,
    )
    row.pricing_snapshot = result["pricing_snapshot"]
    if row.completed_at is None:
        row.cost = None
        row.currency = None
        row.cost_status = "not_supported" if result["cost_status"] == "not_supported" else "pending"
    else:
        row.cost = result["cost"]
        row.currency = result["currency"]
        row.cost_status = result["cost_status"]


def update_call(
    call_id: str, *, provider_request_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """Save an upstream task ID/normalized metadata without finishing a call."""
    db = SessionLocal()
    try:
        row = db.get(APICall, call_id)
        if row is None:
            raise ValueError("API call record does not exist")
        _merge_metadata(row, metadata)
        if provider_request_id is not None:
            row.provider_request_id = str(provider_request_id)[:512]
        _refresh_pricing(row)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _safe_error(error: Any) -> str | None:
    if error is None:
        return None
    text = str(error)
    text = re.sub(r"(?i)bearer\s+[^\s\"']+", "Bearer [redacted]", text)
    text = re.sub(r"\bsk-[A-Za-z0-9_-]+", "[redacted]", text)
    return text[:1000]


def finish_call(
    call_id: str, *, status: str = "success", response: Any = None,
    metadata: dict | None = None, provider_request_id: str | None = None,
    error: Any = None,
) -> None:
    """Complete an existing record; repeated completion never creates a row.

    Reported costs survive missing metadata on later calls. A late response may
    still fill a previously unknown cost after a timeout or interrupted stream.
    """
    if status not in {"success", "failed", "interrupted"}:
        raise ValueError("Unsupported API call status")
    db = SessionLocal()
    try:
        row = db.get(APICall, call_id)
        if row is None:
            raise ValueError("API call record does not exist")
        if response is not None:
            _merge_metadata(row, extract_billing(response, provider=row.provider))
        _merge_metadata(row, metadata)
        if provider_request_id is not None:
            row.provider_request_id = str(provider_request_id)[:512]
        # A cleanup/finally handler must not overwrite an already completed call.
        if row.completed_at is None:
            completed = _now()
            row.status = status
            row.completed_at = completed
            row.duration_ms = max(0, int((completed - row.started_at).total_seconds() * 1000))
            row.error_message = _safe_error(error)
        _refresh_pricing(row)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
