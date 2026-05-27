import httpx
from app.services.video_generation.base import BaseVideoClient
from app.core.config import settings

class AliClient(BaseVideoClient):
    def __init__(self):
        # 优先读取 DASHSCOPE_API_KEY，兼容一般的 ALIYUN_API_KEY 命名
        self.api_key = getattr(settings, "DASHSCOPE_API_KEY", getattr(settings, "ALIYUN_API_KEY", ""))
        if not self.api_key:
            raise ValueError("API_KEY is not configured for Aliyun (DashScope)")
        
        # 默认使用华北2（北京）地域节点
        self.base_url = "https://dashscope.aliyuncs.com/api/v1"
        self.submit_url = f"{self.base_url}/services/aigc/video-generation/video-synthesis"
        self.task_url_prefix = f"{self.base_url}/tasks"

    def _build_headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "X-DashScope-Async": "enable",  # 阿里云视频生成强校验项
            "Content-Type": "application/json",
        }

    async def submit_task(self, client: httpx.AsyncClient, prompt: str, model: str, **kwargs):
        """提交任务"""
        headers = self._build_headers()

        # 1. 提取 URL
        image_urls = kwargs.get("image_urls", [])
        first_frame_url = kwargs.get("first_frame_url")
        last_frame_url = kwargs.get("last_frame_url")

        # 处理首尾帧或多图模式
        final_image_urls = []
        if first_frame_url:
            final_image_urls.append(first_frame_url)
            if last_frame_url:
                final_image_urls.append(last_frame_url)
        else:
            final_image_urls = image_urls

        # ==========================================
        # 🚨 阿里云 HappyHorse 专属防线
        # ==========================================
        if len(final_image_urls) == 0:
            return None, "阿里云限制：HappyHorse 为参考生视频模型，请至少传入1张参考图片。"
        if len(final_image_urls) > 9:
            return None, "阿里云限制：最多支持 9 张参考图，请减少图片数量。"
        # ==========================================

        # 2. 拼装 Media 参数
        media_list = []
        for url in final_image_urls:
            media_list.append({
                "type": "reference_image",
                "url": url
            })

        # 3. 解析模型名称和参数，保障分辨率格式大写 (720p -> 720P)
        model_name = model if model else "happyhorse-1.0-r2v"
        raw_resolution = kwargs.get("resolution", "720P")
        resolution = raw_resolution.upper() if isinstance(raw_resolution, str) else "720P"

        payload = {
            "model": model_name,
            "input": {
                "prompt": prompt,
                "media": media_list
            },
            "parameters": {
                "resolution": resolution,
                "ratio": kwargs.get("ratio", "16:9"),
                "duration": int(kwargs.get("duration", 5)),
                "watermark": False # 默认去水印
            }
        }
        
        print(f"🚀 [AliClient] 准备向 DashScope 提交 {model_name} 任务...")
        print(f"   👉 Resolution: {payload['parameters']['resolution']}, Duration: {payload['parameters']['duration']}")
        print(f"   👉 Images Count: {len(media_list)}")

        try:
            response = await client.post(self.submit_url, headers=headers, json=payload, timeout=60.0)
            res_data = response.json()

            # 处理阿里云特征报错 (包含 code 字段)
            if response.status_code != 200 or "code" in res_data:
                error_message = res_data.get("message", str(res_data))
                return None, f"阿里云 API 错误: {error_message}"
                
            task_id = res_data.get("output", {}).get("task_id")
            if not task_id:
                return None, f"Aliyun Error: 异常返回体，未解析到任务 ID {res_data}"
                
            return str(task_id), "Success"

        except Exception as e:
            return None, f"HTTP 请求提交失败: {str(e)}"

    async def query_status(self, client: httpx.AsyncClient, task_id: str):
        """
        查询状态，严格返回:
        (status: 'Success' | 'Failed' | 'Processing' | 'Queued', result_data)
        """
        url = f"{self.task_url_prefix}/{task_id}"
        # 状态查询不需要 X-DashScope-Async 请求头
        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        try:
            res = await client.get(url, headers=headers, timeout=30.0)
            
            if res.status_code != 200:
                # 屏蔽网络抖动导致的误判，交由上层轮询重试
                return "Processing", f"查询延迟，状态码: {res.status_code}"
                
            data = res.json()
            
            # 捕获异常体
            if "code" in data and data["code"]:
                return "Failed", data.get("message", "Unknown Error")

            output = data.get("output", {})
            status = str(output.get("task_status", "")).upper()

            # 解析状态枚举
            if status == "SUCCEEDED":
                video_url = output.get("video_url")
                if video_url:
                    return "Success", video_url
                return "Failed", "任务已成功，但未找到 video_url 字段"
                
            elif status in ("FAILED", "CANCELED", "UNKNOWN"):
                error_msg = data.get("message") or output.get("message") or "Unknown Error"
                return "Failed", f"平台返回失败或任务作废: {error_msg}"
                
            elif status == "PENDING":
                return "Queued", "排队中"
                
            elif status == "RUNNING":
                return "Processing", "生成中"
                
            else:
                return "Processing", f"未知状态: {status}"

        except Exception as e:
            # 接口异常默认视为 Processing 增加系统容错性
            return "Processing", f"查询接口异常: {str(e)}"