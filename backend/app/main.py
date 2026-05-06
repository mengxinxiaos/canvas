import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, SessionLocal
from app.models.domain import Base, User
from app.api.router import api_router
from app.core.security import get_password_hash  # 👇 完美引入了你的加密函数
from dotenv import load_dotenv
load_dotenv()
# 启动时自动创建数据库表和媒体目录
Base.metadata.create_all(bind=engine)
os.makedirs(settings.MEDIA_ROOT, exist_ok=True)

app = FastAPI(title=settings.APP_NAME)

# ================= 自动创建管理员逻辑 ================= 
def init_superuser():
    # 从环境变量读取，如果没有配置则使用默认值 'admin' / 'admin123'
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "123456")
    
    db = SessionLocal()
    try:
        # 检查是否已经存在该管理员
        user = db.query(User).filter(User.username == admin_username).first()
        if not user:
            print(f"🌱 数据库为空，正在自动初始化超级管理员: {admin_username} ...")
            
            # 👇 使用你提供的 bcrypt 函数进行安全加密
            hashed_password = get_password_hash(admin_password)
            
            admin_user = User(
                username=admin_username,
                password_hash=hashed_password,
                display_name="超级管理员",
                role="admin"  # 赋予管理员权限
            )
            db.add(admin_user)
            db.commit()
            print("✅ 超级管理员创建成功！你可以去登录了。")
    except Exception as e:
        print(f"❌ 初始化管理员失败: {e}")
    finally:
        db.close()

# FastAPI 启动事件：每次服务启动时运行一次 init_superuser
@app.on_event("startup")
def startup_event():
    init_superuser()
# ======================================================= 

# CORS 配置，允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载本地媒体目录，前端可以通过 /media/xxx 访问图片和视频
app.mount("/media", StaticFiles(directory=settings.MEDIA_ROOT), name="media")

# 注册所有 API 路由
app.include_router(api_router, prefix="/api")

@app.get("/api/health")
def health_check():
    return {"code": 0, "message": "ok", "data": {"status": "healthy"}}