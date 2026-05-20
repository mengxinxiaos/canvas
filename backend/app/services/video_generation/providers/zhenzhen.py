import asyncio
import httpx
from app.core.config import settings
from app.services.video_generation.base import BaseVideoClient

class ZhenZhenClient(BaseVideoClient):
    def __init__(self):
        base = (settings.IMAGE_API_BASE or "https://ai.t8star.cn").rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3].rstrip("/")
        self.base_url = base
        self.api_url = f"{self.base_url}/seedance/v3/contents/generations/tasks"
        self.task_url_prefix = f"{self.base_url}/seedance/v3/contents/generations/tasks"
        self.api_key = settings.IMAGE_API_KEY
       
        if not self.api_key:
            raise ValueError("API_KEY is not configured for ZhenZhen")
    
    def _build_api_key(self,model=None):
        return settings.IMAGE_API_KEY

    def _build_headers(self, api_key=None):
        target_key = api_key or self.api_key
        return {
            "Authorization": f"Bearer {target_key}",
            "Content-Type": "application/json",
        }

    async def submit_task(self, client: httpx.AsyncClient, prompt: str, model: str, **kwargs):
        """
        提交任务，返回 (task_id, message) 或 (None, error_message)
        """
        actual_api_key = self._build_api_key(model)
        headers = self._build_headers(actual_api_key)

        # 1. 提取所有类型的 URL 参数 (保持与 volcengine 类似的习惯)
        image_urls = kwargs.get("image_urls", [])
        video_urls = kwargs.get("video_urls", [])
        audio_urls = kwargs.get("audio_urls", [])
        first_frame_url = kwargs.get("first_frame_url")
        last_frame_url = kwargs.get("last_frame_url")

        # ==========================================
        # 🚨 即梦专属防线：校验多模态输入规则
        # ==========================================
        has_visual = (len(image_urls) > 0) or (len(video_urls) > 0) or bool(first_frame_url)
        has_audio = len(audio_urls) > 0
        if has_audio and not has_visual:
            return None, "即梦限制：官方接口不支持仅「文本+音频」或「纯音频」输入，请至少提供1张图片或1个视频作为画面参考。"

        # 2. 动态构建多模态 Content List
        content_list = [{"type": "text", "text": prompt}]

        # 处理图片及首尾帧
        if first_frame_url and last_frame_url:
            content_list.append({"type": "image_url", "image_url": {"url": first_frame_url}, "role": "first_frame"})
            content_list.append({"type": "image_url", "image_url": {"url": last_frame_url}, "role": "last_frame"})
        elif first_frame_url:
            content_list.append({"type": "image_url", "image_url": {"url": first_frame_url}, "role": "first_frame"})
        else:
            for img_url in image_urls[:9]:  # 官方限制最多 9 张
                content_list.append({"type": "image_url", "image_url": {"url": img_url}, "role": "reference_image"})
                
        # 处理视频
        for vid_url in video_urls[:3]:  # 官方限制最多 3 个
            content_list.append({"type": "video_url", "video_url": {"url": vid_url}, "role": "reference_video"})
            
        # 处理音频
        for aud_url in audio_urls[:3]:  # 官方限制最多 3 个
            content_list.append({"type": "audio_url", "audio_url": {"url": aud_url}, "role": "reference_audio"})

        # 3. 拼装 Payload
        payload = {
            "model": model,
            "content": content_list,
            "generate_audio": True,
            "resolution": kwargs.get("resolution", "720p"),
            "ratio": kwargs.get("ratio", "adaptive"),
            "duration": int(kwargs.get("duration", 5)),
            "watermark": False
        }
        
        #web_search = kwargs.get('web_search', False)
        #if web_search and 'seedance-2-0' in model_alias:
           # payload["tools"] = [{"type": "web_search"}]

        # 4. 发起请求
        try:
            response = await client.post(self.api_url, headers=headers, json=payload, timeout=60.0)
            res_data = response.json()

            if response.status_code != 200:
                error_msg = res_data.get("error", {}).get("message", response.text)
                return None, f"API 错误 ({response.status_code}): {error_msg}"

            # 兼容有些情况下叫 id，有些叫 task_id
            task_id = res_data.get("id") or res_data.get("task_id")
            if not task_id:
                return None, f"ZhenZhen Error: 异常返回体，未解析到任务 ID {res_data}"
                
            return str(task_id), "Success"

        except Exception as e:
            return None, f"HTTP 提交请求失败: {str(e)}"

    async def query_status(self, client: httpx.AsyncClient, task_id: str):
        """
        查询状态，必须严格返回如下 Tuple:
        (status: 'Success' | 'Failed' | 'Processing' | 'Queued', result_data: url_or_message)
        """
        url = f"{self.task_url_prefix}/{task_id}"

        headers = self._build_headers()
        
        try:
            res = await client.get(url, headers=headers, timeout=30.0)
            
            # 如果仅仅是网络抖动导致非 200，不要让外层直接 Failed 终止任务，而是视为 Processing
            if res.status_code != 200:
                return "Processing", f"查询延迟，状态码: {res.status_code}"
                
            data = res.json()
            status = str(data.get("status", "")).lower()

            # 解析成功状态
            if status == "succeeded":
                content_data = data.get("content", {})
                video_url = content_data.get("video_url")
                if video_url:
                    return "Success", video_url
                return "Failed", "任务已成功，但未在 content 中找到 video_url 字段"
                
            # 解析失败状态
            elif status in ("failed", "failure", "error", "canceled"):
                error_msg = data.get("error", {}).get("message", "Unknown Error")
                return "Failed", f"平台返回生成失败: {error_msg}"
                
            # 解析排队状态
            elif status == "queued":
                return "Queued", "排队中"
                
            # 其余视作生成中 (包含 running)
            else:
                return "Processing", "生成中"

        except Exception as e:
            # 查询接口偶发的异常，我们返回 Processing 增加系统容错性
            return "Processing", f"查询接口异常: {str(e)}"