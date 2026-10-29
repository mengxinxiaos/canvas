# backend/app/services/agent/client.py

from openai import OpenAI
from app.core.config import settings


def _get_provider_config(provider: str | None) -> tuple[str, str]:
    provider_name = str(provider or "").strip().lower()

    if not provider_name:
        provider_name = "default"

    if provider_name == "runninghub":
        if not settings.RUNNINGHUB_API_KEY:
            raise RuntimeError("RUNNINGHUB_API_KEY 未配置")
        if not settings.RUNNINGHUB_API_BASE:
            raise RuntimeError("RUNNINGHUB_BASE_URL 未配置")

        return settings.RUNNINGHUB_API_KEY, settings.RUNNINGHUB_API_BASE

    if provider_name == "zhenzhen-gpt":
        if not settings.ZHENZHEN_API_KEY_GPT:
            raise RuntimeError("ZHENZHEN_API_KEY 未配置")
        if not settings.ZHENZHEN_API_BASE:
            raise RuntimeError("ZHENZHEN_BASE_URL 未配置")

        return settings.ZHENZHEN_API_KEY_GPT, settings.ZHENZHEN_API_BASE

    if provider_name == "zhenzhen-gemini":
        if not settings.ZHENZHEN_API_KEY:
            raise RuntimeError("ZHENZHEN_API_KEY 未配置")
        if not settings.ZHENZHEN_API_BASE:
            raise RuntimeError("ZHENZHEN_BASE_URL 未配置")

        return settings.ZHENZHEN_API_KEY, settings.ZHENZHEN_API_BASE

    if provider_name == "default":
        if not settings.AGENT_API_KEY:
            raise RuntimeError("AGENT_API_KEY 未配置")
        if not settings.AGENT_BASE_URL:
            raise RuntimeError("AGENT_BASE_URL 未配置")

        return settings.AGENT_API_KEY, settings.AGENT_BASE_URL

    raise ValueError(f"不支持的 Agent provider: {provider_name}")


def create_agent_client(provider: str | None = None) -> OpenAI:
    api_key, base_url = _get_provider_config(provider)

    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        # Application recovery owns retry attempts so each paid attempt can be
        # recorded separately instead of being hidden inside the SDK.
        max_retries=0,
    )
