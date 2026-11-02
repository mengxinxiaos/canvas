# backend/app/services/agent/model_resolver.py

from dataclasses import dataclass, field
from typing import Any

from openai import OpenAI

from app.core.config import settings
from app.services.agent.llm.client_factory import create_agent_client


@dataclass(frozen=True)
class AgentRuntimeModelConfig:
    provider: str | None
    model_id: str
    client: OpenAI
    raw: dict[str, Any] = field(default_factory=dict)
    capabilities: dict[str, Any] = field(default_factory=dict)
    runtime_options: dict[str, Any] = field(default_factory=dict)


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)

    if hasattr(value, "model_dump"):
        dumped = value.model_dump(exclude_none=True)
        return dumped if isinstance(dumped, dict) else {}

    if hasattr(value, "dict"):
        dumped = value.dict(exclude_none=True)
        return dumped if isinstance(dumped, dict) else {}

    return {}


def _clean_str(value: Any) -> str:
    return str(value or "").strip()


def _get_nested_dict(source: dict[str, Any], key: str) -> dict[str, Any]:
    value = source.get(key)

    if isinstance(value, dict):
        return dict(value)

    return {}


def resolve_agent_runtime_model_config(req: Any) -> AgentRuntimeModelConfig:
    """
    把前端传来的开放 agentModel 对象，解析为 Runtime 可直接使用的模型运行配置。

    注意：
    - schema 不枚举 agentModel 内部字段，保证前端后续可扩展
    - 当前后端只强依赖 provider / model_id
    - capabilities / runtime / raw 原样保留，未来需要时再扩展读取
    """
    raw_agent_model = _as_dict(getattr(req, "agentModel", None))

    provider = _clean_str(raw_agent_model.get("provider")) or None

    model_id = (
        _clean_str(raw_agent_model.get("model_id"))
        or _clean_str(raw_agent_model.get("modelId"))
        or _clean_str(raw_agent_model.get("model"))
        or _clean_str(settings.AGENT_MODEL)
    )

    if not model_id:
        raise ValueError("Agent 模型未配置：缺少 agentModel.model_id，且 AGENT_MODEL 未配置")

    capabilities = _get_nested_dict(raw_agent_model, "capabilities")
    runtime_options = _get_nested_dict(raw_agent_model, "runtime")

    client = create_agent_client(provider=provider)

    return AgentRuntimeModelConfig(
        provider=provider,
        model_id=model_id,
        client=client,
        raw=raw_agent_model,
        capabilities=capabilities,
        runtime_options=runtime_options,
    )