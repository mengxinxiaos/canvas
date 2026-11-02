# app/services/agent/service/frontend_tool_state.py

from typing import Any


PENDING_FRONTEND_TOOL_STATUS = "requires_frontend_tool"


def extract_tool_call_ids(
    assistant_message: dict[str, Any] | None,
) -> set[str]:
    if not assistant_message:
        return set()

    tool_calls = assistant_message.get("tool_calls") or []

    result: set[str] = set()

    for call in tool_calls:
        if not isinstance(call, dict):
            continue

        call_id = call.get("id")

        if call_id:
            result.add(str(call_id))

    return result


def extract_result_tool_call_id(result: dict[str, Any]) -> str | None:
    if not isinstance(result, dict):
        return None

    value = (
        result.get("toolCallId")
        or result.get("tool_call_id")
        or result.get("id")
    )

    return str(value) if value else None


class FrontendToolState:
    """
    负责前端工具 pending 状态判断与 toolResults 校验。

    注意：
    - 不访问数据库
    - 不调用 Runtime
    - 不格式化 tool result
    - 只判断状态与校验 ID 匹配关系
    """

    def find_pending_message(self, db_messages: list):
        return next(
            (
                message
                for message in reversed(db_messages)
                if (message.meta_json or {}).get("status")
                == PENDING_FRONTEND_TOOL_STATUS
            ),
            None,
        )

    def validate_results(
        self,
        *,
        assistant_message: dict[str, Any],
        tool_results: list | None,
    ) -> None:
        expected_ids = extract_tool_call_ids(assistant_message)

        if not expected_ids:
            return

        received_ids = {
            tool_call_id
            for tool_call_id in (
                extract_result_tool_call_id(item)
                for item in (tool_results or [])
                if isinstance(item, dict)
            )
            if tool_call_id
        }

        missing_ids = expected_ids - received_ids
        extra_ids = received_ids - expected_ids

        if missing_ids:
            raise ValueError(f"缺少前端工具执行结果: {sorted(missing_ids)}")

        if extra_ids:
            raise ValueError(f"收到未知 toolCallId: {sorted(extra_ids)}")