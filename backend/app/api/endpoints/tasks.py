from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import Task, User
from app.core.deps import get_current_user
from app.services.project_access import ProjectAccessPolicy

router = APIRouter()

@router.get("/{task_id}")
def get_task_status(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    share_token: str | None = Header(default=None, alias="X-Project-Share-Token"),
):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        return {"code": 404, "message": "任务不存在"}

    ProjectAccessPolicy(db).assert_can_view(
        project_id=t.project_id, current_user=current_user, share_token=share_token,
    )
    return {
        "code": 0, 
        "message": "ok", 
        "data": {
            "id": t.id, 
            "status": t.status, 
            "result": t.result_json, 
            "error": t.error_message
        }
    }