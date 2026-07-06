import random
import time
from dataclasses import dataclass
from typing import Any, Callable

from app.core.config import settings


@dataclass
class RecoveryState:
    current_model: str
    consecutive_529: int = 0


def _error_status_code(exc: Exception) -> int | None:
    for attr in ("status_code", "code"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)

    response = getattr(exc, "response", None)
    if response is not None:
        value = getattr(response, "status_code", None)
        if isinstance(value, int):
            return value

    text = str(exc).lower()
    if "429" in text:
        return 429
    if "529" in text:
        return 529
    return None


def _retry_after_seconds(exc: Exception) -> float | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None) if response is not None else None

    if not headers:
        headers = getattr(exc, "headers", None)

    if not headers:
        return None

    try:
        value = headers.get("retry-after") or headers.get("Retry-After")
    except Exception:
        return None

    if value is None:
        return None

    try:
        return max(0.0, float(value))
    except ValueError:
        return None


def is_rate_limit_error(exc: Exception) -> bool:
    code = _error_status_code(exc)
    text = str(exc).lower()
    return code == 429 or "rate limit" in text or "rate_limit" in text


def is_overloaded_error(exc: Exception) -> bool:
    code = _error_status_code(exc)
    text = str(exc).lower()
    return (
        code == 529
        or "overloaded" in text
        or "temporarily overloaded" in text
        or "server overloaded" in text
    )


def is_prompt_too_long_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(
        key in text
        for key in [
            "prompt_too_long",
            "too many tokens",
            "context length",
            "maximum context",
            "context_length_exceeded",
            "413",
        ]
    )


def retry_delay(attempt: int, retry_after: float | None = None) -> float:
    if retry_after is not None:
        return retry_after

    base = min(
        settings.AGENT_BASE_DELAY_MS * (2 ** attempt),
        settings.AGENT_MAX_DELAY_MS,
    ) / 1000.0

    return base + random.uniform(0, base * 0.25)


def with_retry(
    fn: Callable[[], Any],
    state: RecoveryState,
    max_retries: int | None = None,
) -> Any:
    max_retries = max_retries if max_retries is not None else settings.AGENT_MAX_RETRIES
    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            result = fn()
            state.consecutive_529 = 0
            return result

        except Exception as e:
            last_exc = e

            if is_overloaded_error(e):
                state.consecutive_529 += 1
                # 移除了 fallback_model 切换逻辑

            elif is_rate_limit_error(e):
                pass

            else:
                raise

            if attempt >= max_retries:
                break

            delay = retry_delay(attempt, _retry_after_seconds(e))
            print(f"[Agent Recovery] transient API error: {repr(e)}")
            print(f"[Agent Recovery] retrying in {delay:.2f}s ({attempt + 1}/{max_retries})")
            time.sleep(delay)

    raise RuntimeError(f"Agent API 重试失败: {repr(last_exc)}")