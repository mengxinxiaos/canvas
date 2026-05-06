import asyncio
import httpx
import traceback

from app.core.database import SessionLocal
from app.models.domain import Task
from app.services.ai_utils import download_to_local
from app.services.image_generation.utils import IMAGE_API_TIMEOUT
from app.services.image_generation.factory import ImageClientFactory


def _get_task(task_id: str):
    db = SessionLocal()
    try:
        return db.query(Task).filter(Task.id == task_id).first()
    finally:
        db.close()


def _update_task(
    task_id: str,
    *,
    status: str = None,
    result_json=None,
    error_message: str = None,
):
    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return None

        if status is not None:
            task.status = status
        if result_json is not None:
            task.result_json = result_json
        if error_message is not None:
            task.error_message = error_message

        db.commit()
        db.refresh(task)
        return task
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def process_image_task(task_id: str):
    """
    核心异步生图编排任务
    此函数被挂载到 FastAPI 的 BackgroundTasks 中运行
    """
    task = _get_task(task_id)
    if not task:
        return

    try:
        # 1. 更新状态为运行中（短连接）
        _update_task(task_id, status="running")

        # 2. 解析前端传来的参数
        req = task.request_json or {}
        prompt = req.get("prompt")
        model = req.get("model", "nano-banana-2")
        aspect_ratio = req.get("aspectRatio", "1:1")
        image_size = req.get("imageSize", "1K")
        
        provider = req.get("provider", "zhenzhen")
        project_id = task.project_id
        
        inputs = req.get("inputs", [])
        
        # 🌟 直接提取图片的 URL 列表
        image_urls = [item["url"] for item in inputs if item.get("type") == "image"]
        
        # 3. 获取对应的生图客户端实例
        image_client = ImageClientFactory.get_client(provider)

        # 4. 调用生图接口 (直接透传 image_urls，不再下载图片)
        async def _run_generation():
            async with httpx.AsyncClient(timeout=IMAGE_API_TIMEOUT) as client:
                return await image_client.generate(
                    client=client,
                    prompt=prompt,
                    model=model,
                    aspect_ratio=aspect_ratio,
                    image_size=image_size,
                    image_urls=image_urls,  
                )

        # 执行生图与超时控制
        try:
            urls, result_msg = await asyncio.wait_for(_run_generation(), timeout=900)
        except asyncio.TimeoutError:
            urls = None
            result_msg = {"code": "SYSTEM_TIMEOUT", "message": "平台生成超时 (超过15分钟未响应)，已强行终止该任务。"}

        # 失败处理：未拿到 URL，说明提前 return 了错误字典
        if not urls:
            # 兜底转换，防止其他 Client 还没改写成字典格式
            err_info = result_msg if isinstance(result_msg, dict) else {
                "code": "UNKNOWN_ERROR", 
                "message": f"调用底层生图引擎失败: {result_msg}"
            }
            
            _update_task(
                task_id,
                status="failed",
                result_json={"error": err_info},
                error_message=err_info.get("message", "生成失败"),
            )
            return

        # 成功处理：下载图片到本地
        try:
            local_url = await download_to_local(urls[0], project_id, ".png")
        except Exception as e:
            err_info = {"code": "DOWNLOAD_FAILED", "message": f"图片下载到本地失败: {str(e)}"}
            _update_task(
                task_id,
                status="failed",
                result_json={"error": err_info},
                error_message=err_info["message"],
            )
            return

        # 全部完成，回写成功状态
        _update_task(
            task_id,
            status="success",
            result_json={"url": local_url},
            error_message="",
        )

    except Exception as e:
        print(f"❌ 任务 {task_id} 执行发生未预期异常: {traceback.format_exc()}")
        err_info = {"code": "INTERNAL_SERVER_ERROR", "message": f"系统内部错误: {str(e)}"}
        _update_task(
            task_id,
            status="failed",
            result_json={"error": err_info},
            error_message=err_info["message"],
        )