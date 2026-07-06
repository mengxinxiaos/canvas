from dataclasses import dataclass
from typing import Any, Literal
from app.services.agent.llm.model_resolver import resolve_agent_runtime_model_config

from app.core.config import settings
from app.services.agent.runtime.recovery import is_prompt_too_long_error
from app.services.agent.llm.gateway import (
    LLMCompletionRequest,
    OpenAICompatibleLLMGateway,
)
from app.services.agent.prompt import DefaultPromptBuilder
from app.services.agent.schemas import AgentChatRequest
from app.services.agent.runtime.result import AgentTurnResult
from app.services.agent.runtime.compaction import (
    apply_compaction_pipeline,
    reactive_compact,
)
from app.services.agent.tools import (
    get_agent_tools_schema,
    tool_calls_to_frontend_actions,
)


@dataclass
class RuntimeLoopState:
    current_max_tokens: int
    has_escalated: bool = False
    continuation_count: int = 0
    reactive_compact_count: int = 0


@dataclass
class FinishCheckResult:
    action: Literal["continue", "return", "ok"]
    result: dict[str, Any] | None = None


def _normalize_agent_message(message: Any) -> dict[str, Any]:
    """
    Runtime 边界保护：
    AgentChatRequest.messages 允许传入 Pydantic AgentMessage 或 dict。
    Runtime 内部统一只处理 dict。
    """
    if isinstance(message, dict):
        return dict(message)

    if hasattr(message, "model_dump"):
        return message.model_dump(exclude_none=True)

    if hasattr(message, "dict"):
        return message.dict(exclude_none=True)

    raise TypeError(f"不支持的 Agent message 类型: {type(message)!r}")


def _normalize_agent_history(messages: list[Any]) -> list[dict[str, Any]]:
    return [_normalize_agent_message(message) for message in messages or []]


def _assistant_message_for_history(msg: Any) -> dict[str, Any]:
    """
    将模型返回的 assistant message 转成后续请求可复用的协议消息。

    thinking mode 关键点：
    reasoning_content 如果存在，必须传回下一轮 API。
    """
    raw = msg.model_dump(exclude_none=True)

    data: dict[str, Any] = {
        "role": "assistant",
        "content": raw.get("content") or "",
    }

    if raw.get("reasoning_content"):
        data["reasoning_content"] = raw["reasoning_content"]

    if raw.get("tool_calls"):
        data["tool_calls"] = raw["tool_calls"]

    return data



def _compact_messages_safely(
    messages: list[dict[str, Any]],
    system: str,
    model: str,
) -> list[dict[str, Any]]:
    """
    如果消息里包含 tool protocol，不能随便 compact，
    否则可能破坏 assistant tool_calls -> tool message 顺序。
    """
    has_tool_protocol = any(
        msg.get("role") == "tool" or msg.get("tool_calls")
        for msg in messages
    )

    if has_tool_protocol:
        return messages

    return apply_compaction_pipeline(
        messages=messages,
        system=system,
        model=model,
    )


def _build_llm_messages(
    *,
    system: str,
    history: list[dict[str, Any]],
    model: str,
) -> list[dict[str, Any]]:
    return [
        {
            "role": "system",
            "content": system,
        },
        *_compact_messages_safely(
            messages=history,
            system=system,
            model=model,
        ),
    ]


def _call_llm(
    *,
    gateway,
    model: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    allow_tools: bool,
    tools: list[dict[str, Any]],
):
    return gateway.complete(
        LLMCompletionRequest(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            tools=tools if allow_tools and tools else None,
            tool_choice="auto" if allow_tools and tools else None,
        )
    )


def _handle_prompt_too_long(
    *,
    error: Exception,
    loop_state: RuntimeLoopState,
    messages: list[dict[str, Any]],
    system: str,
    model: str,
) -> list[dict[str, Any]]:
    if not is_prompt_too_long_error(error):
        raise error

    if loop_state.reactive_compact_count >= 1:
        raise RuntimeError(
            "上下文过长，已执行基础压缩但仍超过模型限制。"
            "请减少历史消息、画布上下文、选中节点数量，或启用更少的 Skill。"
        )

    loop_state.reactive_compact_count += 1

    non_system_messages = [
        msg for msg in messages
        if msg.get("role") != "system"
    ]

    compacted_history = reactive_compact(
        messages=non_system_messages,
        model=model,
    )

    return [
        {
            "role": "system",
            "content": system,
        },
        *compacted_history,
    ]


def _handle_output_length(
    *,
    msg: Any,
    messages: list[dict[str, Any]],
    loop_state: RuntimeLoopState,
) -> tuple[bool, dict[str, Any] | None]:
    """
    处理模型输出被 max_tokens 截断。
    """
    if not loop_state.has_escalated:
        loop_state.has_escalated = True
        loop_state.current_max_tokens = settings.AGENT_ESCALATED_MAX_TOKENS
        return True, None

    assistant_message = _assistant_message_for_history(msg)
    partial = assistant_message.get("content") or ""

    if partial or assistant_message.get("reasoning_content"):
        messages.append(assistant_message)

    if loop_state.continuation_count < settings.AGENT_MAX_CONTINUATIONS:
        loop_state.continuation_count += 1

        messages.append({
            "role": "user",
            "content": (
                "Output token limit hit. Resume directly. "
                "No apology, no recap. Continue exactly where you stopped."
            ),
        })

        return True, None

    return False, AgentTurnResult.completed(
        answer=partial,
        assistant_message=assistant_message,
    ).to_dict()


def _check_finish_valid(
    *,
    choice: Any,
    msg: Any,
    messages: list[dict[str, Any]],
    loop_state: RuntimeLoopState,
) -> FinishCheckResult:
    finish_reason = getattr(choice, "finish_reason", None)

    if finish_reason == "length":
        should_continue, result = _handle_output_length(
            msg=msg,
            messages=messages,
            loop_state=loop_state,
        )

        if should_continue:
            return FinishCheckResult(action="continue")

        return FinishCheckResult(
            action="return",
            result=result,
        )

    if finish_reason == "content_filter":
        return FinishCheckResult(
            action="return",
            result=AgentTurnResult.completed(
                answer="模型输出被内容安全策略拦截，无法继续生成。",
                assistant_message=None,
            ).to_dict(),
        )

    return FinishCheckResult(action="ok")


def _handle_tool_calls(
    *,
    msg: Any,
    allow_tools: bool,
) -> AgentTurnResult | None:
    """
    处理模型请求前端工具。

    注意：
    - 这里不执行工具
    - 只把 tool_calls 转成 frontendActions
    - assistantMessage 保存完整 assistant 协议消息
    """
    tool_calls = getattr(msg, "tool_calls", None)

    if not tool_calls or not allow_tools:
        return None

    assistant_message = _assistant_message_for_history(msg)
    frontend_actions = tool_calls_to_frontend_actions(tool_calls)

    if not frontend_actions:
        return AgentTurnResult.completed(
            answer=msg.content or "模型请求了未知工具，已忽略。",
            assistant_message=assistant_message,
        )

    return AgentTurnResult.requires_frontend_tool(
        answer=msg.content or "我需要在前端执行一个画布操作。",
        frontend_actions=frontend_actions,
        assistant_message=assistant_message,
    )

def _object_to_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)

    if hasattr(value, "model_dump"):
        dumped = value.model_dump(exclude_none=True)
        return dumped if isinstance(dumped, dict) else {}

    if hasattr(value, "dict"):
        dumped = value.dict(exclude_none=True)
        return dumped if isinstance(dumped, dict) else {}

    return {}

def _extract_stream_delta(chunk: Any) -> tuple[str, Any, str | None]:
    """
    返回: content_delta, delta_obj, finish_reason
    """
    if not getattr(chunk, "choices", None):
        return "", None, None

    choice = chunk.choices[0]
    delta = getattr(choice, "delta", None)
    finish_reason = getattr(choice, "finish_reason", None)

    content = getattr(delta, "content", None) if delta else None

    return content or "", delta, finish_reason


def _get_attr_or_key(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)

    return getattr(value, key, default)


def _merge_stream_tool_call_chunks(raw_chunks: list[Any]) -> list[dict[str, Any]]:
    """
    OpenAI-compatible stream 的 tool_calls 是按 chunk 分片返回的。

    常见形态：
    delta.tool_calls = [
        {
            index: 0,
            id: "...",
            type: "function",
            function: {
                name: "...",
                arguments: "{...分片..."
            }
        }
    ]

    这里按 index 合并 name / arguments。
    """
    merged: dict[int, dict[str, Any]] = {}

    for chunk in raw_chunks:
        index = _get_attr_or_key(chunk, "index", 0)
        try:
            index = int(index or 0)
        except Exception:
            index = 0

        item = merged.setdefault(
            index,
            {
                "id": "",
                "type": "function",
                "function": {
                    "name": "",
                    "arguments": "",
                },
            },
        )

        call_id = _get_attr_or_key(chunk, "id")
        call_type = _get_attr_or_key(chunk, "type")

        if call_id:
            item["id"] = str(call_id)

        if call_type:
            item["type"] = str(call_type)

        function = _get_attr_or_key(chunk, "function")
        function_dict = _object_to_dict(function)

        name_part = function_dict.get("name")
        arguments_part = function_dict.get("arguments")

        if name_part:
            item["function"]["name"] += str(name_part)

        if arguments_part:
            item["function"]["arguments"] += str(arguments_part)

    result = []

    for index in sorted(merged.keys()):
        item = merged[index]

        if not item.get("id"):
            item["id"] = f"call_stream_{index}"

        if not item["function"].get("name"):
            continue

        result.append(item)

    return result


def _build_stream_assistant_message(
    *,
    content: str,
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "role": "assistant",
        "content": content or "",
    }

    if tool_calls:
        data["tool_calls"] = tool_calls

    return data

class AgentRuntime:
    def __init__(self, llm_client=None, prompt_builder=None):
        """
        优先使用外部传入的 llm_client。
        未传入则使用真实 API Client。
        """
        
        self.llm_client = llm_client
        self.prompt_builder = prompt_builder or DefaultPromptBuilder()

    def chat(
        self,
        req: AgentChatRequest,
        allow_tools: bool = True,
    ) -> dict[str, Any]:
        """
        普通调用：
        - 用户消息进入
        - 模型可能直接返回 answer
        - 也可能返回 tool_calls
        - 如果有 tool_calls，则转换为 frontendActions 后暂停
        """
        if not req.messages:
            raise ValueError("messages 不能为空")

        if not req.projectId:
            raise ValueError("projectId 不能为空。Agent 前端工具模式必须绑定项目。")

        runtime_model_config = resolve_agent_runtime_model_config(req)

        client = self.llm_client or runtime_model_config.client

        gateway = OpenAICompatibleLLMGateway(client)

        model_id = runtime_model_config.model_id

        system_prompt = self.prompt_builder.build(req)
        agent_history = _normalize_agent_history(req.messages)

        messages = _build_llm_messages(
            system=system_prompt,
            history=agent_history,
            model=model_id,
        )

        loop_state = RuntimeLoopState(
            current_max_tokens=settings.AGENT_DEFAULT_MAX_TOKENS,
        )

        tools = get_agent_tools_schema() if allow_tools else []

        while True:
            try:
                resp = _call_llm(
                    gateway=gateway,
                    model=model_id,
                    messages=messages,
                    max_tokens=loop_state.current_max_tokens,
                    allow_tools=allow_tools,
                    tools=tools,
                )

            except Exception as e:
                messages = _handle_prompt_too_long(
                    error=e,
                    loop_state=loop_state,
                    messages=messages,
                    system=system_prompt,
                    model=model_id,
                )
                continue

            if not getattr(resp, "choices", None):
                raise RuntimeError("模型返回为空：choices 为空")

            choice = resp.choices[0]
            msg = getattr(choice, "message", None)

            if msg is None:
                raise RuntimeError("模型返回为空：message 为空")

            finish_check = _check_finish_valid(
                choice=choice,
                msg=msg,
                messages=messages,
                loop_state=loop_state,
            )

            if finish_check.action == "continue":
                continue

            if finish_check.action == "return":
                return finish_check.result or AgentTurnResult.completed().to_dict()

            tool_result = _handle_tool_calls(
                msg=msg,
                allow_tools=allow_tools,
            )

            if tool_result is not None:
                return tool_result.to_dict()

            assistant_message = _assistant_message_for_history(msg)

            return AgentTurnResult.completed(
                answer=assistant_message.get("content") or "",
                assistant_message=assistant_message,
            ).to_dict()
    
    def stream_chat(
        self,
        req: AgentChatRequest,
        allow_tools: bool = True,
    ):
        if not req.messages:
            raise ValueError("messages 不能为空")

        if not req.projectId:
            raise ValueError("projectId 不能为空。Agent 前端工具模式必须绑定项目。")

        runtime_model_config = resolve_agent_runtime_model_config(req)

        client = self.llm_client or runtime_model_config.client
        gateway = OpenAICompatibleLLMGateway(client)
        model_id = runtime_model_config.model_id

        system_prompt = self.prompt_builder.build(req)
        agent_history = _normalize_agent_history(req.messages)

        messages = _build_llm_messages(
            system=system_prompt,
            history=agent_history,
            model=model_id,
        )

        tools = get_agent_tools_schema() if allow_tools else []

        full_content = ""
        raw_tool_call_chunks: list[Any] = []

        stream = gateway.stream_complete(
            LLMCompletionRequest(
                model=model_id,
                messages=messages,
                max_tokens=settings.AGENT_DEFAULT_MAX_TOKENS,
                tools=tools if allow_tools and tools else None,
                tool_choice="auto" if allow_tools and tools else None,
            )
        )

        for chunk in stream:
            if not getattr(chunk, "choices", None):
                continue

            choice = chunk.choices[0]
            delta = getattr(choice, "delta", None)

            if delta is None:
                continue

            content_delta = getattr(delta, "content", None) or ""

            if content_delta:
                full_content += content_delta
                yield {
                    "type": "delta",
                    "content": content_delta,
                }

            tool_calls = getattr(delta, "tool_calls", None)
            if tool_calls:
                raw_tool_call_chunks.extend(tool_calls)

        merged_tool_calls = (
            _merge_stream_tool_call_chunks(raw_tool_call_chunks)
            if raw_tool_call_chunks
            else []
        )

        assistant_message = _build_stream_assistant_message(
            content=full_content,
            tool_calls=merged_tool_calls,
        )

        if merged_tool_calls and allow_tools:
            frontend_actions = tool_calls_to_frontend_actions(merged_tool_calls)

            result = AgentTurnResult.requires_frontend_tool(
                answer=full_content or "我需要在前端执行一个画布操作。",
                frontend_actions=frontend_actions,
                assistant_message=assistant_message,
            )

            yield {
                "type": "final",
                "result": result.to_dict(),
            }
            return

        result = AgentTurnResult.completed(
            answer=full_content,
            assistant_message=assistant_message,
        )

        yield {
            "type": "final",
            "result": result.to_dict(),
        }

    def continue_after_frontend_tools(
        self,
        req: AgentChatRequest,
    ) -> dict[str, Any]:
        """
        前端执行工具并回传 toolResults 后调用。

        这一轮必须：
        - messages 里包含 assistant tool_calls message
        - messages 里包含 role=tool messages
        """
        return self.chat(
            req=req,
            allow_tools=True,
        )