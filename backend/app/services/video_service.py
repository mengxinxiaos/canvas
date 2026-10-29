import asyncio
import httpx

from app.core.database import SessionLocal
from app.models.domain import Task
from app.services.ai_utils import download_to_local
from app.services.video_generation.factory import ClientFactory
from app.services.billing import begin_call, update_call, finish_call


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
    api_call_id: str = None,
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
        if api_call_id is not None:
            task.api_call_id = api_call_id

        db.commit()
        db.refresh(task)
        return task
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def resolve_video_mode(model: str, requested_mode: str, image_urls: list[str]):
    image_count = len(image_urls)

    if requested_mode == "multi_ref":
        return "multi_ref"

    if requested_mode == "first_last":
        if image_count == 1:
            return "first_frame"
        elif image_count == 2:
            return "first_last"
        else:
            return "txt2video"

    raise Exception(f"当前模式 {requested_mode} 不支持")
    

async def process_video_task(task_id: str):
    task = _get_task(task_id)
    if not task:
        return

    call_id = None
    upstream_finished = False
    video_client = None
    try:
        # 1. 初始化任务状态（短连接）
        _update_task(task_id, status="running")

        # 2. 解析请求参数
        req = task.request_json or {}
        prompt = req.get("prompt")

        raw_model = req.get("model", "")
        provider = req.get("provider", "")
        # The UI prefixes video model IDs with the provider. Preserve bare IDs.
        prefix = f"{provider}-"
        model = raw_model[len(prefix):] if provider and raw_model.startswith(prefix) else raw_model
        resolution = req.get("resolution", "720p")
        ratio = req.get("aspectRatio") or req.get("ratio") or "adaptive"
        project_id = task.project_id

        duration_str = str(req.get("duration", "5")).replace("s", "")
        duration = int(duration_str) if duration_str.lstrip("-").isdigit() else 5

        inputs = req.get("inputs", [])
        
        image_urls = [item["url"] for item in inputs if item.get("type") == "image"]
        audio_urls = [item["url"] for item in inputs if item.get("type") == "audio"]
        video_urls = [item["url"] for item in inputs if item.get("type") == "video"]

        requested_mode = req.get("mode")
        final_mode = resolve_video_mode(model, requested_mode, image_urls)

        print(f"⚙️ [Task {task_id}] 前端请求模式: {requested_mode}")
        print(f"⚙️ [Task {task_id}] 最终执行模式: {final_mode}")

        kwargs = {
            "duration": duration,
            "resolution": resolution,
            "ratio": ratio,
        }

        print(f"\n⚙️ [Task {task_id}] 开始处理异步任务")
        print(f"⚙️ [Task {task_id}] 数据库中存的图片数量: {len(image_urls)}")
        print(f"⚙️ [Task {task_id}] 数据库中存的音频数量: {len(audio_urls)}")
        print(f"⚙️ [Task {task_id}] 数据库中存的视频数量: {len(video_urls)}")
        
        if final_mode == "multi_ref":
            kwargs["image_urls"] = image_urls
            kwargs["audio_urls"] = audio_urls
            kwargs["video_urls"] = video_urls
        elif final_mode == "first_last":
            kwargs["first_frame_url"] = image_urls[0] if len(image_urls) > 0 else None
            kwargs["last_frame_url"] = image_urls[1] if len(image_urls) > 1 else None
        elif final_mode == "first_frame":
            kwargs["first_frame_url"] = image_urls[0] if len(image_urls) > 0 else None
            kwargs["audio_urls"] = audio_urls
            kwargs["video_urls"] = video_urls

        # 4. 推断 provider
        if not provider:
            raise Exception("provider 不能为空")
        
        # 5. 获取客户端
        video_client = ClientFactory.get_client(provider)
        call_id = begin_call(
            user_id=task.user_id,
            project_id=project_id,
            node_id=task.node_id,
            task_id=task_id,
            provider=video_client.actual_provider,
            model=model,
            call_type="video_generation",
            parameters={
                "duration": duration, "resolution": resolution,
                "ratio": ratio, "mode": final_mode,
                "has_video_input": bool(kwargs.get("video_urls")),
                "video_input_count": len(kwargs.get("video_urls") or []),
            },
        )
        _update_task(task_id, api_call_id=call_id)

        async with httpx.AsyncClient(timeout=30.0) as client:
            remote_task_id, msg = await video_client.submit_task(
                client, prompt, model, **kwargs
            )

            if not remote_task_id:
                raise Exception(f"提交任务失败: {msg}") 

            # Persist the supplier task ID as soon as submission succeeds.
            update_call(
                call_id,
                provider_request_id=str(remote_task_id),
                metadata=video_client.billing_metadata,
            )

            max_queue_seconds = 1800
            max_process_seconds = 600
            poll_interval = 5

            if final_mode == "multi_ref":
                max_queue_seconds = 3600
                max_process_seconds = 1800

            queue_elapsed = 0
            process_elapsed = 0
            remote_video_url = None
            last_status = None

            while True:
                await asyncio.sleep(poll_interval)
                status, result_data = await video_client.query_status(client, remote_task_id)

                if status == "Success":
                    finish_call(
                        call_id,
                        status="success",
                        provider_request_id=str(remote_task_id),
                        metadata=video_client.billing_metadata,
                    )
                    upstream_finished = True
                    remote_video_url = await video_client.get_download_url(client, result_data)
                    break

                elif status in ["Failed", "Error"]:
                    raise Exception(f"调用失败: {result_data}")

                elif status == "Queued":
                    if last_status != "queued":
                        _update_task(task_id, status="queued")
                        last_status = "queued"

                    queue_elapsed += poll_interval
                    if queue_elapsed >= max_queue_seconds:
                        raise Exception(f"排队等待超时，上游任务可能仍在执行 (等候了 {queue_elapsed} 秒)")

                    if queue_elapsed % 60 == 0:
                        print(f"[Task {task_id}] [{model}] 排队中... 已耗时 {queue_elapsed} 秒")

                elif status == "Processing":
                    if last_status != "processing":
                        _update_task(task_id, status="processing")
                        last_status = "processing"

                    process_elapsed += poll_interval
                    if process_elapsed >= max_process_seconds:
                        raise Exception(f"生成超时，可能卡死 (算力执行了 {process_elapsed} 秒)")

                    if process_elapsed % 60 == 0:
                        print(f"[Task {task_id}] [{model}] 正在生成... 算力执行已耗时 {process_elapsed} 秒")

                else:
                    if last_status != "running":
                        _update_task(task_id, status="running")
                        last_status = "running"

            if not remote_video_url:
                raise Exception("视频生成异常，未获取到 URL")

            # 6. 下载并落库
            local_url = await download_to_local(remote_video_url, project_id, ".mp4")

            _update_task(
                task_id,
                status="success",
                result_json={"url": local_url},
                error_message="",
            )

    except Exception as e:
        if call_id and not upstream_finished:
            finish_call(
                call_id,
                status="success" if getattr(video_client, "generation_succeeded", False) else "failed",
                metadata=getattr(video_client, "billing_metadata", None),
                provider_request_id=getattr(video_client, "provider_request_id", None),
                error=type(e).__name__,
            )
        error_msg = f"视频生成失败: {str(e)}"
        print(f"⚠️ [Task {task_id}] Failed: {error_msg}")
        _update_task(
            task_id,
            status="failed",
            error_message=error_msg,
        )
