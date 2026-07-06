# app/services/agent/tools/frontend_tools.py

import json
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.services.agent.tools.registry import (
    FrontendToolRegistry,
    FrontendToolSpec,
)


class CreateImageArgs(BaseModel):
    prompt: str = Field(..., description="图片生成提示词，必须是可直接用于图片生成的完整提示词。")
    x: float = Field(default=600.0, description="画布 x 坐标。不确定时省略。")
    y: float = Field(default=300.0, description="画布 y 坐标。不确定时省略。")
    aspectRatio: str = Field(default="1:1", description="图片比例，例如 1:1、16:9、9:16。不确定时省略。")


class CreateVideoArgs(BaseModel):
    prompt: str = Field(..., description="视频生成提示词，必须是可直接用于视频生成的完整提示词。")
    x: float = Field(default=650.0, description="画布 x 坐标。不确定时省略。")
    y: float = Field(default=320.0, description="画布 y 坐标。不确定时省略。")
    duration: str = Field(default="5", description="视频时长，例如 5。不确定时省略。")
    ratio: str = Field(default="adaptive", description="视频比例，例如 adaptive、16:9、9:16。不确定时省略。")

class ReadSelectedCanvasNodesArgs(BaseModel):
    includeImages: bool = Field(default=True, description="是否返回图片 URL、媒体信息和生成参数。默认 true。")
    includeGeometry: bool = Field(default=True, description="是否返回节点位置和尺寸。默认 true。")
    includeGeneration: bool = Field(default=True, description="是否返回生图/视频节点的 generation 参数。默认 true。")

class CanvasNodeEditOperation(BaseModel):
    path: str = Field(
        ...,
        description=(
            "要修改的字段路径。必须来自 read_selected_canvas_nodes 返回的 editableFields[].path，"
            "例如 content、generation.prompt、position.x、size.w、style.bgColor。"
        ),
    )
    value: Any = Field(
        ...,
        description="要写入的新值。类型必须匹配 editableFields 中声明的 valueType。",
    )


class UpdateSelectedCanvasNodeArgs(BaseModel):
    targetMode: Literal["single_selected", "all_selected"] = Field(
        default="single_selected",
        description="single_selected 只修改当前单个选中节点；all_selected 修改所有选中节点。",
    )
    operations: list[CanvasNodeEditOperation] = Field(
        ...,
        description="字段修改操作列表。path 必须来自 read_selected_canvas_nodes 返回的 editableFields。",
    )


def build_frontend_tool_registry() -> FrontendToolRegistry:
    return FrontendToolRegistry([
        FrontendToolSpec(
            name="create_image_node",
            description=(
                "当用户要求创建图片节点、生图节点、图片生成节点、视觉方案节点时调用。"
                "该工具只请求前端在当前画布创建一个 image 节点，不会直接生成图片。"
                "节点完整结构由前端补全。"
            ),
            args_model=CreateImageArgs,
            command_type="create_node",
            node_type="image",
        ),
        FrontendToolSpec(
            name="create_video_node",
            description=(
                "当用户要求创建视频节点、动画节点、镜头节点、视频生成节点时调用。"
                "该工具只请求前端在当前画布创建一个 video 节点，不会直接生成视频。"
                "节点完整结构由前端补全。"
            ),
            args_model=CreateVideoArgs,
            command_type="create_node",
            node_type="video",
        ),
        FrontendToolSpec(
            name="read_selected_canvas_nodes",
            description=(
                "当用户要求读取、查看、分析、总结当前画布中已选中的节点内容时调用。"
                "该工具由前端读取当前 selection 对应的节点数据。"
                "可返回文本内容、节点类型、图片 URL、视频 URL、生成参数、位置和尺寸。"
                "注意：如果当前模型本身不支持视觉，该工具只能返回图片 URL 和节点元数据，不能保证模型能识别图片像素内容。"
            ),
            args_model=ReadSelectedCanvasNodesArgs,
            command_type="read_selected_canvas_nodes",
        ),
        FrontendToolSpec(
            name="update_selected_canvas_node",
            description=(
                "当用户要求修改当前选中的画布节点时调用。"
                "调用前应先使用 read_selected_canvas_nodes 获取当前节点的 editableFields。"
                "本工具只接受 editableFields 中存在的 path，禁止猜测字段。"
            ),
            args_model=UpdateSelectedCanvasNodeArgs,
            command_type="update_selected_canvas_node",
        ),
    ])


_FRONTEND_TOOL_REGISTRY = build_frontend_tool_registry()


def get_frontend_tool_names() -> list[str]:
    """
    兼容旧调用：获取所有注册的前端工具名称。
    """
    return _FRONTEND_TOOL_REGISTRY.names()


def get_agent_tools_schema() -> list[dict[str, Any]]:
    """
    兼容旧调用：给 OpenAI 的 tools 参数。
    """
    return _FRONTEND_TOOL_REGISTRY.schemas()


def tool_call_to_frontend_action(tool_call: Any) -> dict[str, Any] | None:
    """
    兼容旧调用：OpenAI tool_call -> frontendAction。
    """
    return _FRONTEND_TOOL_REGISTRY.action_from_tool_call(tool_call)


def tool_calls_to_frontend_actions(tool_calls: list[Any]) -> list[dict[str, Any]]:
    """
    兼容旧调用：批量转换。
    """
    return _FRONTEND_TOOL_REGISTRY.actions_from_tool_calls(tool_calls)


def format_frontend_result(result: dict) -> dict | None:
    """
    前端工具结果 -> 模型 tool message。

    这段逻辑暂时保持原样。
    后面如果要支持后端工具 / 异步工具，再抽成 ToolResultFormatter。
    """
    if not isinstance(result, dict):
        return None

    copied = dict(result)
    tool_call_id = copied.pop("toolCallId", "")

    if not tool_call_id:
        return None

    return {
        "role": "tool",
        "tool_call_id": str(tool_call_id),
        "content": json.dumps(
            copied,
            ensure_ascii=False,
            default=str,
        ),
    }