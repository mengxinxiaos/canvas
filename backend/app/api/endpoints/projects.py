from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import uuid
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.domain import Project, User
from app.utils import get_project_folder, rename_project_folder
from app.core.websocket import manager
from datetime import timezone

router = APIRouter()

class ProjectCreate(BaseModel):
    name: str
    is_folder: Optional[bool] = False 
    parent_id: Optional[str] = None    

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    viewport: Optional[dict] = None
    nodes: Optional[list] = None
    edges: Optional[list] = None
    version: Optional[int] = None
    thumbnail: Optional[str] = None

class ProjectMove(BaseModel):
    parent_id: Optional[str] = None

@router.get("")
def list_projects(parent_id: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):

    query = db.query(Project).filter(Project.owner_id == current_user.id)
    if parent_id:
        query = query.filter(Project.parent_id == parent_id)
    else:
        query = query.filter(Project.parent_id == None) # 根目录
        
    projects = query.all()
    
    res = []
    for p in projects:
        # 1. 获取最新时间
        dt = p.updated_at if p.updated_at else p.created_at
        
        # 2. 👈 核心修复：强制声明它是 UTC 时间，然后再获取 timestamp
        updated_ts = dt.replace(tzinfo=timezone.utc).timestamp()

        res.append({
            "id": p.id, 
            "name": p.name, 
            "updatedAt": updated_ts, 
            "nodes": p.content_json.get("nodes", []),
            "thumbnail": p.thumbnail,
            "isFolder": p.is_folder,   
            "parentId": p.parent_id    
        })
    return {"code": 0, "message": "ok", "data": res}

@router.post("")
def create_project(req: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 👇 保存文件夹标识
    p = Project(name=req.name, owner_id=current_user.id, is_folder=req.is_folder, parent_id=req.parent_id)
    # ...
    db.add(p)
    db.commit()
    db.refresh(p)
    get_project_folder(p, create=True)
    return {"code": 0, "message": "ok", "data": {"id": p.id}}

@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    """
    获取项目详情（支持分享访问，无需登录）
    """
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p: return {"code": 404, "message": "项目不存在"}
    
    return {"code": 0, "message": "ok", "data": {
        "id": p.id, "name": p.name, "ownerId": p.owner_id, "version": p.version,
        "viewport": p.viewport_json, "nodes": p.content_json.get("nodes", []), "edges": p.content_json.get("edges", [])
    }}

# WebSocket 路由，让前端连进来
@router.websocket("/{project_id}/ws")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    await manager.connect(websocket, project_id)
    try:
        while True:
            # Phase 1 我们只需要后端推给前端，前端发心跳或暂时什么都不发也行
            data = await websocket.receive_text() 
    except WebSocketDisconnect:
        manager.disconnect(websocket, project_id)

@router.put("/{project_id}")
async def update_project(project_id: str, req: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        return {"code": 404, "message": "项目不存在"}
    
    if req.version is not None and p.version != req.version:
        return {"code": 4090, "message": "数据冲突，版本不一致", "data": {"serverVersion": p.version}}
    
    old_name = p.name
    
    if req.name is not None:
        p.name = req.name
    if req.viewport is not None:
        p.viewport_json = req.viewport
    if req.nodes is not None and req.edges is not None:
        p.content_json = {"nodes": req.nodes, "edges": req.edges}
    if req.thumbnail is not None:
        p.thumbnail = req.thumbnail
    
    p.version += 1
    db.commit()
    
    if req.name is not None:
        rename_project_folder(db, p, old_name)

    # 数据库保存成功后，通知房间里的其他人！
    # 为了防止发送广播时阻塞接口响应，最好不要让当前保存的用户卡住
    await manager.broadcast({
        "type": "PROJECT_UPDATED",
        "version": p.version,
        "message": "项目数据已更新"
    }, project_id)
    
    return {"code": 0, "message": "ok", "data": {"version": p.version}}

@router.post("/{project_id}/move")
def move_project(project_id: str, req: ProjectMove, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    工业级移动节点：包含权限校验、目标合法性校验和防循环嵌套机制
    """
    # 1. 查找要移动的项目/文件夹是否存在，且属于当前用户
    p = db.query(Project).filter(Project.id == project_id, Project.owner_id == current_user.id).first()
    if not p:
        return {"code": 404, "message": "项目不存在或无权限操作"}

    target_parent_id = req.parent_id

    # 2. 如果目标目录和当前目录一样，直接视为成功 (No-op)
    if p.parent_id == target_parent_id:
        return {"code": 0, "message": "ok"}

    # 3. 如果不是移动到根目录，需要对目标文件夹进行严格校验
    if target_parent_id is not None:
        # 防御 A: 不能将文件夹移动到自身
        if target_parent_id == project_id:
            return {"code": 400, "message": "不能将文件夹移动到自身内部"}

        target_folder = db.query(Project).filter(Project.id == target_parent_id, Project.owner_id == current_user.id).first()
        
        # 防御 B: 目标必须存在
        if not target_folder:
            return {"code": 404, "message": "目标文件夹不存在"}
        
        # 防御 C: 目标必须是一个“文件夹”，不能把项目塞进另一个“画布”里
        if not target_folder.is_folder:
            return {"code": 400, "message": "目标位置不是一个有效的文件夹"}

        # 防御 D: 死循环校验 (核心！)
        # 如果当前移动的是一个文件夹，必须确保目标文件夹不是当前文件夹的子目录
        if p.is_folder:
            current_check = target_folder
            # 向上回溯目标文件夹的祖先链路
            while current_check.parent_id is not None:
                if current_check.parent_id == p.id:
                    return {"code": 400, "message": "非法操作：不能将文件夹移动到其自身的子文件夹中"}
                
                # 继续往上找
                current_check = db.query(Project).filter(Project.id == current_check.parent_id).first()
                if not current_check:
                    break # 数据断层，防御性跳出

    # 4. 校验全部通过，执行移动
    p.parent_id = target_parent_id
    db.commit()

    return {"code": 0, "message": "ok"}
    
@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    db.query(Project).filter(Project.id == project_id).delete()
    db.commit()
    return {"code": 0, "message": "ok"}

# 补充缺失的分享接口
class ShareRequest(BaseModel):
    permission: str

@router.post("/{project_id}/share")
def create_share(project_id: str, req: ShareRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    创建分享链接
    """
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        return {"code": 404, "message": "项目不存在"}
    
    # 验证所有权
    if p.owner_id != current_user.id:
        return {"code": 403, "message": "无权分享该项目"}
    
    # 生成分享 token（本版本直接返回 UUID 给前端拼接使用）
    share_token = uuid.uuid4().hex
    
    return {"code": 0, "message": "ok", "data": {"token": share_token}}

@router.get("/shared/{share_token}")
def get_shared_project(share_token: str, db: Session = Depends(get_db)):
    """
    通过分享 token 获取项目（本版本暂不验证 token，直接通过 projectId 查询）
    注意：实际项目中应将 token 存入数据库并关联 projectId
    """
    # 本简化版本：token 仅用于前端标识，实际通过 projectId 查询
    # 前端会同时传递 shareToken 和 projectId
    return {"code": 0, "message": "ok", "data": {"token": share_token}}