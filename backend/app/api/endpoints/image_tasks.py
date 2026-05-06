from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.core.database import get_db
from app.models.domain import Task
# 假设这里引入的是我们上一步重构好的异步核心逻辑
from app.services.image_service import process_image_task 

router = APIRouter()

# 扩展 Request 模型，全面支持多种参数
class ImageTaskRequest(BaseModel):
    projectId: str
    nodeId: str
    prompt: str
    mode: Optional[str] = None
    aspectRatio: Optional[str] = "1:1"
    model: Optional[str] = "nano-banana-2"  
    imageSize: Optional[str] = "1K"
    provider: Optional[str] = "zhenzhen"
    inputs: Optional[List[Dict[str, Any]]] = []

@router.post("/image-generation")
def create_image_task(
    req: ImageTaskRequest, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)
):
    # 1. 创建并保存任务记录 (Pending 状态)
    t = Task(
        project_id=req.projectId,
        node_id=req.nodeId,
        task_type="image_generation", 
        status="pending",
        request_json=req.model_dump() # Pydantic v2 推荐用法
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    
    # 2. 🚀 核心修改：直接传入异步函数名及其参数，无需使用 asyncio.run
    background_tasks.add_task(process_image_task, t.id)
    
    # 3. 立即响应前端
    return {
        "code": 0, 
        "message": "ok", 
        "data": {
            "taskId": t.id, 
            "status": "pending"
        }
    }