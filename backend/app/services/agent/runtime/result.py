# app/services/agent/domain/turn_result.py

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AgentTurnStatus(str, Enum):
    """
    Agent 单轮对话状态。

    使用 str + Enum，而不是 StrEnum，
    兼容 Python 3.10 及以下版本。
    """

    COMPLETED = "completed"
    REQUIRES_FRONTEND_TOOL = "requires_frontend_tool"


@dataclass(frozen=True)
class AgentTurnResult:
    """
    Runtime 单轮执行结果。

    注意：
    - Runtime 内部尽量使用这个对象
    - 对外暂时通过 to_dict() 保持旧结构，避免影响 ChatService
    """

    status: AgentTurnStatus
    answer: str = ""
    frontend_actions: list[dict[str, Any]] = field(default_factory=list)
    assistant_message: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "answer": self.answer,
            "frontendActions": self.frontend_actions,
            "assistantMessage": self.assistant_message,
        }

    @classmethod
    def completed(
        cls,
        *,
        answer: str = "",
        assistant_message: dict[str, Any] | None = None,
        frontend_actions: list[dict[str, Any]] | None = None,
    ) -> "AgentTurnResult":
        return cls(
            status=AgentTurnStatus.COMPLETED,
            answer=answer,
            frontend_actions=frontend_actions or [],
            assistant_message=assistant_message,
        )

    @classmethod
    def requires_frontend_tool(
        cls,
        *,
        answer: str,
        frontend_actions: list[dict[str, Any]],
        assistant_message: dict[str, Any] | None,
    ) -> "AgentTurnResult":
        return cls(
            status=AgentTurnStatus.REQUIRES_FRONTEND_TOOL,
            answer=answer,
            frontend_actions=frontend_actions,
            assistant_message=assistant_message,
        )