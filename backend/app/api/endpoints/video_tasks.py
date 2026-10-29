from fastapi import APIRouter, Depends, BackgroundTasks, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.core.database import get_db
from app.models.domain import Task, User
from app.core.deps import get_current_user
from app.services.project_access import ProjectAccessPolicy
from app.services.video_service import process_video_task

router = APIRouter()

# 扩展 Request 模型，全面支持多种视频参数（海螺和即梦）
# video_tasks.py 修改如下

class VideoTaskRequest(BaseModel):
    projectId: str
    nodeId: str
    prompt: str
    mode: Optional[str] = None
    model: Optional[str] = "doubao-seedance-1-5-pro-251215"
    
    # 补全 provider，接收前端传来的服务商标志
    provider: Optional[str] = None 
    
    # 时长可能是 "5s", "6", "-1"，放宽为 str 处理
    duration: Optional[str] = "5"
    # 分辨率可能是 "720p", "1080p", "768P", "1080P"
    resolution: Optional[str] = "720p"
    
    # 补全比例字段，请确保前端 genParams 里面传的是 ratio 或者 aspectRatio
    # 为了兼容，你可以开启 Pydantic 的 extra 参数，或者显式声明
    ratio: Optional[str] = "adaptive" 
    aspectRatio: Optional[str] = None
    inputs: Optional[List[Dict[str, Any]]] = []

@router.post("/video-generation")
def create_video_task(
    req: VideoTaskRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    share_token: str | None = Header(default=None, alias="X-Project-Share-Token"),
):
    ProjectAccessPolicy(db).assert_can_edit(
        project_id=req.projectId, current_user=current_user, share_token=share_token,
    )
    t = Task(
        user_id=current_user.id,
        project_id=req.projectId,
        node_id=req.nodeId,
        task_type="video_generation", 
        status="pending",
        request_json=req.model_dump()
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    
    background_tasks.add_task(process_video_task, t.id)
    return {"code": 0, "message": "ok", "data": {"taskId": t.id, "status": "pending"}}