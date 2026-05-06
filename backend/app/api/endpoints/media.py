import os
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import Media, generate_id, Project
from app.utils.oss_utils import upload_object_async

router = APIRouter()

@router.post("/upload")
async def upload_media(
    projectId: str = Form(...),
    category: str = Form("original"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == projectId).first()
    if not project:
        return {"code": 404, "message": "项目不存在"}
    
    media_id = generate_id("m")
    safe_filename = file.filename.replace(" ", "_")
    stored_name = f"{media_id}_{safe_filename}"
    
    # 生成 OSS key
    key = f"projects/{project.id}/{category}/{stored_name}"
    
    # 读取文件内容
    content = await file.read()
    
    # 上传到 OSS
    oss_url = await upload_object_async(
        key=key,
        stream=content,
        content_type=file.content_type or "application/octet-stream"
    )
    
    db.add(Media(id=media_id, project_id=projectId, relative_path=oss_url, mime_type=file.content_type))
    db.commit()
    
    return {"code": 0, "message": "ok", "data": {"id": media_id, "url": oss_url}}