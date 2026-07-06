import json
from typing import Any

from app.core.config import settings
from app.services.agent.llm.client_factory import create_agent_client
from app.services.agent.runtime.recovery import RecoveryState, with_retry


def message_text(msg: dict[str, Any]) -> str:
    # (保持原有的逻辑不变)
    content = msg.get("content", "")
    if isinstance(content, str): return content
    if isinstance(content, list):
        parts = [str(item.get("text") or item.get("content") or getattr(item, "text", "")) for item in content if isinstance(item, dict) or hasattr(item, "text")]
        return "\n".join(parts)
    return str(content) if content is not None else ""


def estimate_size(system: str, messages: list[dict[str, Any]]) -> int:
    return len(system) + len(json.dumps(messages, ensure_ascii=False, default=str))

def clone_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    压缩流程内部使用的浅拷贝。

    目的：
    - 避免 micro_compact / snip_compact 修改调用方传入的原始 messages
    - 保持当前消息结构不变
    - 不做深拷贝，避免不必要的性能成本

    当前压缩逻辑只会修改 message 顶层字段，例如 content，
    所以 dict 浅拷贝已经够用。
    """
    return [dict(message) for message in messages]
# =========================================================
# 工具边界保护
# =========================================================

def _is_tool_message(msg: dict[str, Any]) -> bool:
    return msg.get("role") == "tool"

def _has_tool_calls(msg: dict[str, Any]) -> bool:
    return msg.get("role") == "assistant" and bool(msg.get("tool_calls"))

def _protect_tail_boundary(messages: list[dict[str, Any]], tail_start: int) -> int:
    """防止尾部切片切出没有 assistant 爸爸的孤儿 tool 消息"""
    while tail_start > 0 and tail_start < len(messages) and _is_tool_message(messages[tail_start]):
        tail_start -= 1
    return tail_start

# =========================================================
# L1 & L2 廉价压缩
# =========================================================

def micro_compact(messages: list[dict[str, Any]], keep_recent: int = 3) -> list[dict[str, Any]]:
    """
    L2: 把旧的前端工具返回结果替换为占位符，节省大量 Token。

    注意：
    - 不修改传入的 messages
    - 返回新的 messages 列表
    """
    compacted = clone_messages(messages)

    tool_results = [
        (i, m)
        for i, m in enumerate(compacted)
        if _is_tool_message(m)
    ]

    if len(tool_results) <= keep_recent:
        return compacted

    # 把除了最近几个之外的旧 tool result 压缩掉
    for _, msg in tool_results[:-keep_recent]:
        content = str(msg.get("content", ""))

        if len(content) > 100:
            msg["content"] = (
                '{"status": "compacted", '
                '"note": "Earlier tool result compacted."}'
            )

    return compacted

def snip_compact(messages: list[dict[str, Any]], max_messages: int | None = None) -> list[dict[str, Any]]:
    """L1: 掐头去尾，但严格保护工具调用配对完整性"""
    max_messages = max_messages or getattr(settings, "AGENT_SNIP_MAX_MESSAGES", 20)

    if len(messages) <= max_messages:
        return messages

    keep_head = 2
    keep_tail = max_messages - keep_head
    head_end = keep_head
    tail_start = len(messages) - keep_tail

    # 1. 保护头部：如果头部最后一条是调用工具的 assistant，必须把紧跟的 tool 结果也划进头部
    if head_end > 0 and _has_tool_calls(messages[head_end - 1]):
        while head_end < len(messages) and _is_tool_message(messages[head_end]):
            head_end += 1

    # 2. 保护尾部：尾部起点不能切在 tool 消息中间
    tail_start = _protect_tail_boundary(messages, tail_start)

    # 如果边界碰撞，说明全是连体婴，放弃剪切
    if head_end >= tail_start:
        return messages

    placeholder = {
        "role": "user",
        "content": f"[中间 {tail_start - head_end} 条历史消息已被裁剪，以节省上下文。]",
    }

    return messages[:head_end] + [placeholder] + messages[tail_start:]

# =========================================================
# L4 & Emergency 深度压缩
# =========================================================

def summarize_history(messages: list[dict[str, Any]], model: str) -> str:
    client = create_agent_client()
    conversation = json.dumps(messages, ensure_ascii=False, default=str)[:80000]

    prompt = (
        "请总结下面这段 Tapnow Agent 对话历史，用于上下文压缩后继续对话。\n"
        "必须保留：\n"
        "1. 用户当前目标\n2. 已经讨论过的关键决定\n3. 当前项目/画布/节点相关信息\n"
        "4. 用户偏好和限制\n5. 下一步应该继续做什么\n\n"
        "要求：简洁但具体，只输出总结文本。\n\n"
        f"Conversation JSON:\n{conversation}"
    )

    state = RecoveryState(current_model=model)

    def call_llm():
        return client.chat.completions.create(
            model=state.current_model,
            messages=[
                {"role": "system", "content": "你负责总结 Agent 对话状态。只输出总结文本，不要调用工具。"},
                {"role": "user", "content": prompt},
            ],
            max_tokens=2000,
        )

    resp = with_retry(call_llm, state)
    return (resp.choices[0].message.content or "").strip() or "(empty summary)"


def compact_history(messages: list[dict[str, Any]], model: str) -> list[dict[str, Any]]:
    """L4: 全量总结"""
    summary = summarize_history(messages, model=model)
    return [{"role": "user", "content": f"[历史对话已压缩]\n\n{summary}"}]


def reactive_compact(messages: list[dict[str, Any]], model: str) -> list[dict[str, Any]]:
    """Emergency: 遭遇 413 过长报错时的反应性压缩，保留尾部"""
    summary = summarize_history(messages, model=model)

    tail_start = max(0, len(messages) - 5)
    # 同样必须保护尾部！
    tail_start = _protect_tail_boundary(messages, tail_start)
    tail = messages[tail_start:]

    return [{"role": "user", "content": f"[因上下文过长，历史对话已压缩]\n\n{summary}"}, *tail]


def apply_compaction_pipeline(
    messages: list[dict[str, Any]], system: str, model: str
) -> list[dict[str, Any]]:
    """执行压缩管线。不会修改传入的 messages。"""
    compacted = micro_compact(messages)
    compacted = snip_compact(compacted)

    if estimate_size(system, compacted) > getattr(settings, "AGENT_CONTEXT_LIMIT", 30000):
        compacted = compact_history(messages=compacted, model=model)

    return compacted