from pathlib import Path
from typing import Any
import re

from app.core.config import settings


DEFAULT_SKILLS_DIR = Path(__file__).parent.parent / "skill_library"

MAX_SKILL_CHARS = 6000
MAX_TOTAL_SKILLS_CHARS = 16000

SAFE_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-\u4e00-\u9fff]+$")


def get_skills_dir() -> Path:
    """
    优先使用 settings.AGENT_SKILLS_DIR。
    没配置时使用 services/agent/skill_library。
    """
    custom_dir = getattr(settings, "AGENT_SKILLS_DIR", None)

    if custom_dir:
        return Path(custom_dir).resolve()

    return DEFAULT_SKILLS_DIR.resolve()


def ensure_skills_dir() -> Path:
    skills_dir = get_skills_dir()
    skills_dir.mkdir(parents=True, exist_ok=True)
    return skills_dir


def _clip(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text

    return text[:max_chars] + f"\n\n...[技能内容已截断 {len(text) - max_chars} 字符]"


def _safe_skill_name(name: str) -> str:
    name = str(name or "").strip()

    if not name:
        raise ValueError("技能名称不能为空")

    if "/" in name or "\\" in name or ".." in name:
        raise ValueError("技能名称非法")

    if not SAFE_SKILL_NAME_RE.match(name):
        raise ValueError("技能名称只能包含中文、英文、数字、下划线和中划线")

    return name


def _read_skill_file(skill_dir: Path) -> str | None:
    skill_file = skill_dir / "SKILL.md"

    if not skill_file.exists():
        skill_file = skill_dir / "skill.md"

    if not skill_file.exists() or not skill_file.is_file():
        return None

    try:
        return skill_file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return skill_file.read_text(encoding="utf-8", errors="ignore")


def discover_skills() -> list[dict[str, Any]]:
    """
    扫描技能目录。

    每个技能目录结构：
      skill_name/
        SKILL.md
    """
    skills_dir = ensure_skills_dir()

    result: list[dict[str, Any]] = []

    for item in sorted(skills_dir.iterdir()):
        if not item.is_dir():
            continue

        text = _read_skill_file(item)

        if not text:
            continue

        result.append({
            "name": item.name,
            "content": _clip(text, MAX_SKILL_CHARS),
        })

    return result


def get_skill_by_name(name: str) -> dict[str, Any] | None:
    """
    按技能名称读取单个技能。
    只允许读取 skills_dir 下的一级技能目录，防止路径穿越。
    """
    skill_name = _safe_skill_name(name)

    skills_dir = ensure_skills_dir()
    skill_dir = (skills_dir / skill_name).resolve()

    try:
        skill_dir.relative_to(skills_dir.resolve())
    except ValueError:
        raise ValueError("技能路径越界")

    if not skill_dir.exists() or not skill_dir.is_dir():
        return None

    text = _read_skill_file(skill_dir)

    if not text:
        return None

    return {
        "name": skill_name,
        "content": _clip(text, MAX_SKILL_CHARS),
    }


def get_skills_by_names(names: list[str] | None) -> list[dict[str, Any]]:
    """
    用户主动选择哪些技能，后端就只加载哪些技能。
    """
    if not names:
        return []

    selected: list[dict[str, Any]] = []
    seen = set()

    for raw_name in names:
        if raw_name in seen:
            continue

        seen.add(raw_name)

        skill = get_skill_by_name(raw_name)

        if skill:
            selected.append(skill)

    return selected


def skills_to_system_text(skills: list[dict[str, Any]]) -> str:
    if not skills:
        return ""

    parts = [
        "## 用户主动启用的技能说明\n"
        "下面这些 Skill 是用户在前端技能库中主动选择的。"
        "你必须优先遵守这些 Skill 的工作方法、输出格式和限制。"
    ]

    total = 0

    for skill in skills:
        block = f"\n\n### Skill: {skill['name']}\n{skill['content']}"
        total += len(block)

        if total > MAX_TOTAL_SKILLS_CHARS:
            parts.append("\n\n...[更多技能因长度限制已省略]")
            break

        parts.append(block)

    return "".join(parts)