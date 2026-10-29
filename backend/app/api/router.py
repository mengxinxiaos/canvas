from fastapi import APIRouter
from app.api.endpoints import auth, projects, media, tasks, image_tasks, video_tasks, agent, billing

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(media.router, prefix="/media", tags=["Media"])

# 均使用 /tasks 前缀，保证前端接口路径完全不变
api_router.include_router(image_tasks.router, prefix="/tasks", tags=["Image Generation"])
api_router.include_router(video_tasks.router, prefix="/tasks", tags=["Video Generation"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["Task Status"])

api_router.include_router(agent.router, prefix="/agent", tags=["Agent"])
api_router.include_router(billing.router, prefix="/admin", tags=["API Usage"])
