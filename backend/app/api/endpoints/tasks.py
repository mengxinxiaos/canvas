from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import Task

router = APIRouter()

@router.get("/{task_id}")
def get_task_status(task_id: str, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        return {"code": 404, "message": "任务不存在"}
        
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