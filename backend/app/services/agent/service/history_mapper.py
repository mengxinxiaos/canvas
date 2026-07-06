# app/services/agent/service/history_mapper.py

from typing import Any

from app.services.agent.tools import format_frontend_result


class AgentHistoryMapper:
    """
    负责 DB message 与 Agent Runtime history 之间的转换。

    注意：
    - 不访问数据库
    - 不调用 Runtime
    - 不创建/更新 message
    - 只做消息结构转换
    """

    def format_frontend_tool_result_messages(
        self,
        tool_results: list | None,
    ) -> list[dict[str, Any]]:
        formatted_messages: list[dict[str, Any]] = []

        for item in tool_results or []:
            formatted = format_frontend_result(item)

            if formatted:
                formatted_messages.append(formatted)

        return formatted_messages

    def get_stored_assistant_message(
        self,
        meta: dict[str, Any],
    ) -> dict[str, Any] | None:
        """
        assistantMessage 是新主字段。
        assistantToolMessage 只用于兼容旧数据。
        """
        assistant_message = meta.get("assistantMessage")

        if isinstance(assistant_message, dict):
            return assistant_message

        legacy_tool_message = meta.get("assistantToolMessage")

        if isinstance(legacy_tool_message, dict):
            return legacy_tool_message

        return None
    
    def _build_user_content(
        self,
        text: str,
        attachments: list[dict[str, Any]],
    ):
        image_parts = []

        for item in attachments or []:
            if not isinstance(item, dict):
                continue

            if item.get("type") != "image":
                continue

            url = str(item.get("url") or "").strip()
            if not url:
                continue

            image_parts.append({
                "type": "image_url",
                "image_url": {
                    "url": url,
                },
            })

        if not image_parts:
            return text or ""

        parts: list[dict[str, Any]] = []

        if text and text.strip():
            parts.append({
                "type": "text",
                "text": text,
            })
        else:
            parts.append({
                "type": "text",
                "text": "请分析这张图片。",
            })

        parts.extend(image_parts)
        return parts

    def db_messages_to_agent_history(
        self,
        db_messages: list,
        *,
        stop_before_message_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        将数据库消息恢复成 Runtime 可直接发送给模型的 agent_history。

        thinking mode 关键点：
        assistant 历史必须优先使用 meta_json.assistantMessage，
        不能只恢复成 {"role": "assistant", "content": "..."}。
        """
        agent_history: list[dict[str, Any]] = []

        for message in db_messages:
            if stop_before_message_id and message.id == stop_before_message_id:
                break

            if message.role == "user":
                meta = message.meta_json or {}
                attachments = meta.get("attachments") or []

                agent_history.append({
                    "role": "user",
                    "content": self._build_user_content(
                        message.content or "",
                        attachments,
                    ),
                })
                continue

            if message.role != "assistant":
                continue

            meta = message.meta_json or {}
            assistant_message = self.get_stored_assistant_message(meta)
            frontend_tool_results = meta.get("frontendToolResults") or []

            if isinstance(assistant_message, dict):
                agent_history.append(assistant_message)

                if assistant_message.get("tool_calls") and frontend_tool_results:
                    agent_history.extend(
                        self.format_frontend_tool_result_messages(
                            frontend_tool_results
                        )
                    )

                continue

            # 兼容旧数据。旧数据没有 reasoning_content，thinking mode 下可能无法继续。
            agent_history.append({
                "role": "assistant",
                "content": message.content or "",
            })

        return agent_history