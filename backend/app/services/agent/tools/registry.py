# app/services/agent/tools/registry.py

import json
from dataclasses import dataclass
from typing import Any, Type

from pydantic import BaseModel


def _get_attr_or_key(value: Any, name: str, default: Any = None) -> Any:
    """
    兼容 OpenAI SDK 对象和 dict 两种结构。

    当前 Runtime 里多半拿到的是 SDK 对象；
    但历史持久化或测试时可能出现 dict。
    """
    if isinstance(value, dict):
        return value.get(name, default)

    return getattr(value, name, default)


@dataclass(frozen=True)
class FrontendToolSpec:
    """
    一个前端工具的完整规格。

    它知道：
    - 如何导出给模型看的 OpenAI tools schema
    - 如何把模型返回的 tool_call 转成前端 action
    """

    name: str
    description: str
    args_model: Type[BaseModel]
    command_type: str
    node_type: str | None = None

    def to_openai_schema(self) -> dict[str, Any]:
        parameters = self.args_model.model_json_schema()
        parameters.pop("title", None)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "strict": True,
                "parameters": parameters,
            },
        }

    def to_frontend_action(self, tool_call: Any) -> dict[str, Any]:
        tool_call_id = _get_attr_or_key(tool_call, "id", "")

        function = _get_attr_or_key(tool_call, "function", {})
        raw_args_str = _get_attr_or_key(function, "arguments", "{}")

        try:
            raw_args = (
                json.loads(raw_args_str or "{}")
                if isinstance(raw_args_str, str)
                else raw_args_str
            )

            validated_args = self.args_model(**raw_args).model_dump()
            if self.node_type:
                validated_args["nodeType"] = self.node_type

            return {
                "toolCallId": tool_call_id,
                "toolName": self.name,
                "command": {
                    "type": self.command_type,
                    "payload": validated_args,
                },
            }

        except Exception as exc:
            return {
                "toolCallId": tool_call_id,
                "toolName": self.name,
                "command": {
                    "type": "tool_error",
                    "payload": {
                        "error": f"参数校验失败: {str(exc)}",
                    },
                },
            }


class FrontendToolRegistry:
    """
    前端工具注册表。

    新增前端工具时，只需要新增 FrontendToolSpec，
    不需要改 schema 生成和 action 转换主流程。
    """

    def __init__(self, specs: list[FrontendToolSpec]):
        self._specs = {spec.name: spec for spec in specs}

    def names(self) -> list[str]:
        return list(self._specs.keys())

    def schemas(self) -> list[dict[str, Any]]:
        return [spec.to_openai_schema() for spec in self._specs.values()]

    def action_from_tool_call(self, tool_call: Any) -> dict[str, Any] | None:
        function = _get_attr_or_key(tool_call, "function", {})
        tool_name = str(_get_attr_or_key(function, "name", "") or "")

        spec = self._specs.get(tool_name)

        if not spec:
            return None

        return spec.to_frontend_action(tool_call)

    def actions_from_tool_calls(self, tool_calls: list[Any]) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []

        for tool_call in tool_calls or []:
            action = self.action_from_tool_call(tool_call)

            if action:
                actions.append(action)

        return actions