from dataclasses import dataclass
from typing import Any, Protocol

from app.services.agent.runtime.recovery import RecoveryState, with_retry


@dataclass(frozen=True)
class LLMCompletionRequest:
    """
    Runtime 调用模型时使用的稳定请求对象。

    这一层用于隔离 OpenAI SDK 的具体参数结构。
    后续不同 provider、不同模型参数、stream 模式，都可以在 Gateway 内部扩展。
    """
    model: str
    messages: list[dict[str, Any]]
    max_tokens: int
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | None = None


class LLMGateway(Protocol):
    """
    LLM 调用抽象。

    Runtime 只依赖这个接口，不直接依赖具体 SDK。
    """
    def complete(self, request: LLMCompletionRequest) -> Any:
        ...


class OpenAICompatibleLLMGateway:
    """
    OpenAI 兼容协议的模型调用实现。

    当前你的 create_agent_client() 返回的是 OpenAI-compatible client，
    所以这里仍然使用 client.chat.completions.create。
    """

    def __init__(self, client: Any):
        self.client = client

    def complete(self, request: LLMCompletionRequest) -> Any:
        state = RecoveryState(current_model=request.model)

        def call_llm():
            kwargs: dict[str, Any] = {
                "model": state.current_model,
                "messages": request.messages,
                "max_tokens": request.max_tokens,
            }

            if request.tools:
                kwargs["tools"] = request.tools
                kwargs["tool_choice"] = request.tool_choice or "auto"

            return self.client.chat.completions.create(**kwargs)

        return with_retry(call_llm, state)
        
    def stream_complete(self, request: LLMCompletionRequest):
        state = RecoveryState(current_model=request.model)

        def call_llm():
            kwargs: dict[str, Any] = {
                "model": state.current_model,
                "messages": request.messages,
                "max_tokens": request.max_tokens,
                "stream": True,
            }

            if request.tools:
                kwargs["tools"] = request.tools
                kwargs["tool_choice"] = request.tool_choice or "auto"

            return self.client.chat.completions.create(**kwargs)

        return with_retry(call_llm, state)