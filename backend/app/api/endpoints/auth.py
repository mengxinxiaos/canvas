from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.deps import get_current_user
from app.models.domain import User
from typing import Optional

router = APIRouter()

class AuthRequest(BaseModel):
    username: str
    password: str

@router.post("/register")
def register(req: AuthRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 核心管控：拦截非管理员的开通请求
    if current_user.role != "admin":
        return {"code": 403, "message": "无权限，仅管理员可开通账号"}
        
    existing_user = db.query(User).filter(User.username == req.username).first()
    if existing_user:
        return {"code": 4000, "message": "用户名已存在"}
        
    user = User(
        username=req.username, 
        display_name=req.username, 
        password_hash=get_password_hash(req.password),
        role="user"  # 默认创建普通用户
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"code": 0, "message": "开通成功", "data": {"id": user.id, "username": user.username}}

@router.post("/login")
def login(req: AuthRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    
    if not user:
        # 移除自动注册，改为直接拒绝
        return {"code": 4004, "message": "账号不存在，请联系管理员开通"}
    elif not verify_password(req.password, user.password_hash):
        return {"code": 4001, "message": "密码错误"}

    token = create_access_token(data={"sub": user.id})
    return {
        "code": 0, "message": "ok", 
        "data": {
            "accessToken": token, 
            "user": {"id": user.id, "username": user.username, "displayName": user.display_name, "role": user.role}
        }
    }

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "code": 0, "message": "ok", 
        "data": {"id": current_user.id, "username": current_user.username, "displayName": current_user.display_name, "role": current_user.role}
    }

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None # 如果传了就修改密码

@router.get("/users")
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """管理员获取所有用户列表"""
    if current_user.role != "admin":
        return {"code": 403, "message": "无权限，仅管理员可查看"}
    
    users = db.query(User).all()
    res = [{
        "id": str(u.id), 
        "username": u.username, 
        "displayName": u.display_name, 
        "role": u.role,
        "createdAt": u.created_at.timestamp() if u.created_at else None
    } for u in users]
    
    return {"code": 0, "message": "ok", "data": res}

@router.put("/users/{target_user_id}")
def update_user(target_user_id: str, req: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """管理员修改用户信息"""
    if current_user.role != "admin":
        return {"code": 403, "message": "无权限"}
        
    target_user = db.query(User).filter(User.id == target_user_id).first()
    if not target_user:
        return {"code": 404, "message": "用户不存在"}
        
    if req.display_name is not None:
        target_user.display_name = req.display_name
    if req.role is not None:
        target_user.role = req.role
    if req.password is not None and len(req.password.strip()) > 0:
        target_user.password_hash = get_password_hash(req.password)
        
    db.commit()
    return {"code": 0, "message": "修改成功"}

@router.delete("/users/{target_user_id}")
def delete_user(target_user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """管理员删除用户"""
    if current_user.role != "admin":
        return {"code": 403, "message": "无权限"}
        
    # 防止管理员把自己删了
    if str(current_user.id) == target_user_id:
        return {"code": 4000, "message": "不能删除当前登录账号"}
        
    # 注意：在真实业务中，通常建议做“软删除”（is_deleted=True），或者要清理该用户关联的项目
    db.query(User).filter(User.id == target_user_id).delete()
    db.commit()
    return {"code": 0, "message": "删除成功"}