import httpx
from app.services.video_generation.base import BaseVideoClient
from app.core.config import settings

class VolcengineClient(BaseVideoClient):
    def __init__(self, is_po_xian):
        api_version = "po_xian" if is_po_xian else "default"
        self.api_key, self.base_url = self.get_api_details(api_version)

    def get_api_details(self, api_version):
        if api_version == "po_xian":
            api_key = settings.VOLCENGINE_POXIAN_API_KEY 
            base_url = settings.VOLCENGINE_POXIAN_API_BASE
        else:
            api_key = settings.VOLCENGINE_API_KEY
            base_url = settings.VOLCENGINE_API_BASE
            
        if not base_url.endswith("tasks"):
            base_url = base_url.rstrip('/') + "/contents/generations/tasks"
            
        return api_key, base_url

    async def submit_task(self, client: httpx.AsyncClient, prompt: str, model: str, **kwargs):
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # 1. 提取所有类型的 URL
        audio_urls = kwargs.get("audio_urls", [])
        video_urls = kwargs.get("video_urls", [])
        image_urls = kwargs.get("image_urls", [])
        first_frame_url = kwargs.get("first_frame_url")
        last_frame_url = kwargs.get("last_frame_url")

        # ==========================================
        # 🚨 火山引擎专属防线：严格校验输入参数
        # ==========================================
        if len(image_urls) > 9:
            return None, "火山引擎限制：最多支持 9 张参考图，请在画布中减少图片连线。"
        if len(video_urls) > 3:
            return None, "火山引擎限制：最多支持 3 段参考视频，请在画布中减少视频连线。"
        if len(audio_urls) > 3:
            return None, "火山引擎限制：最多支持 3 首参考音频，请在画布中减少音频连线。"

        has_visual_input = (len(image_urls) > 0) or (len(video_urls) > 0) 
        if len(audio_urls) > 0 and not has_visual_input:
            return None, "火山引擎限制：不支持「纯音频」或「文本+音频」输入。请在画布中至少连接一张图片或一段视频作为视觉参考。"
        # ==========================================

        content = [{"type": "text", "text": prompt}]
        print(f"🚀 [VolcengineClient(HTTP)] 准备拼装 {model} 请求 Payload...")

        # 2. 拼装音频
        if len(audio_urls) > 0:
            for url in audio_urls:
                content.append({"type": "audio_url", "audio_url": {"url": url}, "role": "reference_audio"})

        # 3. 拼装视频
        if len(video_urls) > 0:
            for url in video_urls:
                content.append({"type": "video_url", "video_url": {"url": url}, "role": "reference_video"})

        # 4. 拼装图片
        if len(image_urls) > 0 and first_frame_url is None:
            print(f"   👉 收到传入的 image_urls 数量: {len(image_urls)}")
            for index, url in enumerate(image_urls):
                content.append({
                    "type": "image_url",
                    "image_url": {"url": url},
                    "role": "reference_image"
                })
                print(f"   ✅ [图 {index+1}] 成功加入 content: {url}")
        else:
            # 兼容首尾帧和单图模式
            if first_frame_url and last_frame_url:
                content.append({"type": "image_url", "image_url": {"url": first_frame_url}, "role": "first_frame"})
                content.append({"type": "image_url", "image_url": {"url": last_frame_url}, "role": "last_frame"})
            elif first_frame_url:
                content.append({"type": "image_url", "image_url": {"url": first_frame_url}})
        
        payload = {
            "model": model,
            "content": content,
            "generate_audio": True,
            "resolution": kwargs.get("resolution", "720p"),
            "ratio": kwargs.get("ratio", "adaptive"),
            "duration": int(kwargs.get("duration", 5)),
            "watermark": False
        }
        
        print(f"🚀 [VolcengineClient(HTTP)] 最终发给火山的 payload 核心参数:")
        print(f"   👉 Resolution: {payload['resolution']}")
        print(f"   👉 Duration: {payload['duration']}")
        print(f"   👉 Ratio: {payload['ratio']}")
        print(f"🚀 [VolcengineClient(HTTP)] content 节点数: {len(payload['content'])}")
        
        try:
            response = await client.post(self.base_url, headers=headers, json=payload, timeout=60.0)
            res_data = response.json()
            
            # API 直接调用时，如果报错通常会返回 error 字段
            if "error" in res_data:
                error_message = res_data.get("error", {}).get("message", str(res_data))
                return None, f"Volcengine API 错误: {error_message}"
                
            if "id" not in res_data:
                return None, f"Volc Error: 异常返回体 {res_data}"
                
            return res_data["id"], "Success"
        except Exception as e:
            return None, f"HTTP 请求失败: {str(e)}"

    async def query_status(self, client: httpx.AsyncClient, task_id: str):
        url = f"{self.base_url}/{task_id}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            res = await client.get(url, headers=headers, timeout=30.0)
            data = res.json()
            status = data.get("status")
            
            if status == "succeeded":
                if "content" in data and "video_url" in data["content"]:
                    return "Success", data["content"]["video_url"]
                return "Failed", "No video_url in content"
            elif status == "failed" or status == "canceled":
                return "Failed", data.get("error", {}).get("message", "Unknown Error")
            elif status == "queued":
                return "Queued", "排队中"
            else:
                # 默认视作 "processing" 状态
                return "Processing", "生成中"
        except Exception as e:
            return "Error", str(e)