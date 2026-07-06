# backend/app/services/project_access.py

from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.domain import Project, User


class ProjectAccessPolicy:
    """
    项目访问策略：
    - 项目所有者拥有完整权限
    - 拿到有效 share_token 的访问者拥有链接权限
    - created_by 不参与 Agent 对话权限判断
    """

    def __init__(self, db: Session):
        self.db = db

    def get_project_or_404(self, project_id: str) -> Project:
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        return project

    def assert_can_view(
        self,
        *,
        project_id: str,
        current_user: User | None,
        share_token: str | None,
    ) -> Project:
        project = self.get_project_or_404(project_id)

        if current_user and project.owner_id == current_user.id:
            return project

        if project.share_enabled and project.share_token and share_token == project.share_token:
            return project

        raise HTTPException(status_code=403, detail="无权访问项目")

    def assert_can_edit(
        self,
        *,
        project_id: str,
        current_user: User | None,
        share_token: str | None,
    ) -> Project:
        project = self.assert_can_view(
            project_id=project_id,
            current_user=current_user,
            share_token=share_token,
        )

        if current_user and project.owner_id == current_user.id:
            return project

        if (
            project.share_enabled
            and project.share_token
            and share_token == project.share_token
            and project.share_permission == "edit"
        ):
            return project

        raise HTTPException(status_code=403, detail="无权编辑项目")