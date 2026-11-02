from typing import Protocol

from app.services.agent.prompt.templates import get_system_prompt
from app.services.agent.schemas import AgentChatRequest
from app.services.agent.prompt.skills import get_skills_by_names, skills_to_system_text


class PromptBuilder(Protocol):
    """
    系统提示词构建抽象。

    Runtime 只依赖这个抽象，不关心 Skill 如何读取、如何拼接。
    """

    def build(self, req: AgentChatRequest) -> str:
        ...


class DefaultPromptBuilder:
    """
    默认 PromptBuilder。

    保持当前业务逻辑不变：
    - 从 req.skillNames 读取用户启用的技能
    - 读取 Skill 文件内容
    - 拼进系统提示词
    - 注入项目上下文
    """

    def build(self, req: AgentChatRequest) -> str:
        skill_names = getattr(req, "skillNames", None) or []
        selected_skills = get_skills_by_names(skill_names)
        skills_text = skills_to_system_text(selected_skills)

        return get_system_prompt(
            context=req.context,
            skills_text=skills_text,
        )