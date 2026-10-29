import httpx
from app.services.video_generation.base import BaseVideoClient
from app.core.config import settings
# 注意：移除了 image_to_base64 的引入，现在直接使用 URL

class MiniMaxClient(BaseVideoClient):
    def __init__(self):
        self.api_key = settings.MINIMAX_API_KEY
        base_url = settings.MINIMAX_API_BASE or "https://api.minimaxi.com/v1/video_generation"
        self.base_url = base_url.strip()
        self.query_url = "https://api.minimaxi.com/v1/query/video_generation"
        self.retrieve_url = "https://api.minimaxi.com/v1/files/retrieve"

    async def submit_task(self, client: httpx.AsyncClient, prompt: str, model: str, **kwargs):
        headers = {
            'authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        # 1. 提取所有类型的 URL
        audio_urls = kwargs.get("audio_urls", [])
        video_urls = kwargs.get("video_urls", [])
        image_urls = kwargs.get("image_urls", [])
        first_frame_url = kwargs.get("first_frame_url")
        last_frame_url = kwargs.get("last_frame_url")

        # ==========================================
        # 🚨 MiniMax 专属防线：严格校验输入参数
        # ==========================================
        if len(audio_urls) > 0:
            return None, "MiniMax 模型暂不支持参考音频，请在画布中断开音频连线。"
        
        if len(video_urls) > 0:
            return None, "MiniMax 模型暂不支持参考视频，请在画布中断开视频连线。"
            
        if len(image_urls) > 2:
            return None, "MiniMax 模型最多支持 2 张参考图（首尾帧），请在画布中减少图片连线。"
        # ==========================================

        payload = {
            "model": model,
            "prompt": prompt,
            "prompt_optimizer": True
        }
        
        if "duration" in kwargs: 
            payload["duration"] = int(kwargs["duration"])
        if "resolution" in kwargs: 
            payload["resolution"] = kwargs["resolution"]

        # 2. 兼容各种图片传递模式
        # 如果从 multi_ref 模式传过来一个列表，我们自动将其映射为首尾帧
        final_first_frame = first_frame_url or (image_urls[0] if len(image_urls) > 0 else None)
        final_last_frame = last_frame_url or (image_urls[1] if len(image_urls) > 1 else None)

        # 绝大多数大模型 API 均支持直接传入图片的公网 URL
        if final_first_frame:
            payload["first_frame_image"] = final_first_frame
        if final_last_frame:
            payload["last_frame_image"] = final_last_frame

        print(f"🚀 [MiniMaxClient] 准备拼装 {model} 请求 Payload，包含首图: {bool(final_first_frame)}，尾图: {bool(final_last_frame)}")

        try:
            response = await client.post(self.base_url, headers=headers, json=payload, timeout=60.0)
            data = response.json()
            if data.get("base_resp", {}).get("status_code") != 0:
                return None, f"MiniMax API Error: {data.get('base_resp', {}).get('status_msg')}"
            return data.get("task_id"), "Success"
        except Exception as e:
            return None, f"MiniMax 请求异常: {str(e)}"

    async def query_status(self, client: httpx.AsyncClient, task_id: str):
        headers = {'authorization': f'Bearer {self.api_key}'}
        try:
            response = await client.get(f"{self.query_url}?task_id={task_id}", headers=headers, timeout=30.0)
            data = response.json()
            status = data.get("status")
            if status == "Success":
                return "Success", data.get("file_id")
            elif status == "Fail":
                return "Failed", data.get('base_resp', {}).get('status_msg', 'Unknown')
            else:
                return "Processing", status
        except Exception as e:
            return "Error", str(e)

    async def get_download_url(self, client: httpx.AsyncClient, file_id: str):
        # 注意：MiniMax 由于安全机制，确实需要这一步去单独换取下载直链
        headers = {'authorization': f'Bearer {self.api_key}'}
        try:
            resp = await client.get(f"{self.retrieve_url}?file_id={file_id}", headers=headers, timeout=30.0)
            data = resp.json()
            return data.get("file", {}).get("download_url")
        except:
            return None