import json
from typing import Any


PROMPT_SECTIONS: dict[str, str] = {
    "identity": (
        "你是 Tapnow 无限画布项目中的 AI Agent。"
        "你的任务是帮助用户完成创意策划、提示词优化、画布内容分析、项目推进和创作决策。"
        "你要直接、清晰、有执行价值。"
    ),
    "safety": (
        "## 当前能力边界\n"
        "你运行在云端 Web 后端中。\n"
        "当前阶段你不能执行 shell，不能直接写文件，不能直接修改数据库，不能假装已经操作了画布。\n"
        "如果用户要求你修改画布、创建节点、调用生图或视频任务，你应该说明当前还需要后端工具能力接入，"
        "然后给出可执行建议或可复制的内容。"
    ),
    "workflow": (
        "## 工作方式\n"
        "1. 优先理解用户当前画布和选中节点的上下文。\n"
        "2. 如果信息不足，先说明缺少什么，不要编造。\n"
        "3. 回答要尽量可执行，可以给步骤、提示词、结构化建议。\n"
        "4. 如果用户让你生成提示词，直接给可复制版本。\n"
        "5. 如果用户在做动画、分镜、场景、角色或 AIGC 工作流，回答要服务实际制作。"
    ),
    "skills": (
        "{skills_text}"
    ),
    "project": (
        "## 项目上下文\n"
        "{project_context}"
    ),
}


def compact_json(value: Any, max_chars: int = 8000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str, indent=2)
    except Exception:
        text = str(value)

    if len(text) > max_chars:
        return text[:max_chars] + "\n...[context truncated]"

    return text


def build_prompt_context(context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = context or {}

    project = context.get("project") or {}
    canvas = context.get("canvas") or {}
    user = context.get("user") or {}

    project_context = {
        "user": {
            "id": user.get("id"),
            "username": user.get("username"),
            "displayName": user.get("displayName"),
        },
        "project": {
            "id": project.get("id"),
            "name": project.get("name"),
        },
        "canvas": {
            "nodeCount": canvas.get("nodeCount"),
            "edgeCount": canvas.get("edgeCount"),
            "selectedNodeIds": canvas.get("selectedNodeIds", []),
            "selectedNodes": canvas.get("selectedNodes", []),
        },
    }

    return {
        "project_context": compact_json(project_context),
    }


def assemble_system_prompt(
    prompt_context: dict[str, Any],
    skills_text: str = "",
) -> str:
    sections: list[str] = []

    sections.append(PROMPT_SECTIONS["identity"])
    sections.append(PROMPT_SECTIONS["safety"])
    sections.append(PROMPT_SECTIONS["workflow"])

    if skills_text.strip():
        sections.append(
            PROMPT_SECTIONS["skills"].format(
                skills_text=skills_text.strip()
            )
        )

    sections.append(
        PROMPT_SECTIONS["project"].format(
            project_context=prompt_context.get("project_context", "{}")
        )
    )

    return "\n\n".join(s.strip() for s in sections if s and s.strip())


def get_system_prompt(
    context: dict[str, Any] | None = None,
    skills_text: str = "",
) -> str:
    prompt_context = build_prompt_context(context)

    return assemble_system_prompt(
        prompt_context=prompt_context,
        skills_text=skills_text,
    )