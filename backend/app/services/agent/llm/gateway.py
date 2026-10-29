from dataclasses import dataclass
from typing import Any, Protocol

from app.services.agent.runtime.recovery import RecoveryState, with_retry
from app.services.billing import (
    begin_call,
    current_billing_context,
    extract_billing,
    finish_call,
)


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

    def __init__(self, client: Any, provider: str | None = None, call_type: str = "agent_chat"):
        self.client = client
        self.provider = provider or "default"
        self.call_type = call_type

    def _begin_call(self, request: LLMCompletionRequest, *, stream: bool, attempt: int):
        context = current_billing_context.get()
        if context is None:
            return None
        return begin_call(
            user_id=context.user_id,
            project_id=context.project_id,
            operation_id=context.operation_id,
            conversation_id=context.conversation_id,
            node_id=context.node_id,
            provider=self.provider,
            model=request.model,
            call_type=self.call_type,
            parameters={"max_tokens": request.max_tokens, "stream": stream, "attempt": attempt},
        )

    def complete(self, request: LLMCompletionRequest) -> Any:
        state = RecoveryState(current_model=request.model)
        attempt = 0

        def call_llm():
            nonlocal attempt
            attempt += 1
            kwargs: dict[str, Any] = {
                "model": state.current_model,
                "messages": request.messages,
                "max_tokens": request.max_tokens,
            }

            if request.tools:
                kwargs["tools"] = request.tools
                kwargs["tool_choice"] = request.tool_choice or "auto"

            call_id = self._begin_call(request, stream=False, attempt=attempt)
            try:
                response = self.client.chat.completions.create(**kwargs)
            except Exception as exc:
                if call_id:
                    finish_call(call_id, status="failed", error=type(exc).__name__)
                raise
            if call_id:
                finish_call(call_id, response=response)
            return response

        return with_retry(call_llm, state)
        
    def stream_complete(self, request: LLMCompletionRequest):
        state = RecoveryState(current_model=request.model)
        attempt = 0

        def call_llm():
            nonlocal attempt
            attempt += 1
            kwargs: dict[str, Any] = {
                "model": state.current_model,
                "messages": request.messages,
                "max_tokens": request.max_tokens,
                "stream": True,
            }

            if request.tools:
                kwargs["tools"] = request.tools
                kwargs["tool_choice"] = request.tool_choice or "auto"

            # Do not blindly request stream_options: some compatible suppliers do
            # not support it. Capture any billing/usage chunks they actually send.
            call_id = self._begin_call(request, stream=True, attempt=attempt)
            try:
                stream = self.client.chat.completions.create(**kwargs)
            except Exception as exc:
                if call_id:
                    finish_call(call_id, status="failed", error=type(exc).__name__)
                raise
            return stream, call_id

        def tracked_stream():
            # Open lazily: closing an unconsumed generator must not leave an
            # upstream stream or a pending call record behind.
            stream, call_id = with_retry(call_llm, state)
            metadata: dict[str, Any] = {}
            status = "interrupted"
            error = None
            try:
                for chunk in stream:
                    # Usage-only chunks often have no choices. Inspect them here,
                    # before Runtime filters content/tool deltas.
                    incoming = extract_billing(chunk, provider=self.provider)
                    if incoming.get("cost") is not None:
                        metadata["cost"] = incoming["cost"]
                        metadata["cost_status"] = incoming["cost_status"]
                    for key in ("currency", "provider_request_id", "billing_model"):
                        if incoming.get(key):
                            metadata[key] = incoming[key]
                    if incoming.get("usage_json"):
                        metadata["usage_json"] = {
                            **metadata.get("usage_json", {}),
                            **incoming["usage_json"],
                        }
                    yield chunk
                status = "success"
            except GeneratorExit:
                raise
            except BaseException as exc:
                status = "failed"
                error = type(exc).__name__
                raise
            finally:
                try:
                    close = getattr(stream, "close", None)
                    if close:
                        close()
                finally:
                    if call_id:
                        finish_call(call_id, status=status, metadata=metadata, error=error)

        return tracked_stream()
