import httpx
from app.core.config import settings
from app.services.image_generation.base import BaseImageClient
from app.services.image_generation.utils import IMAGE_API_TIMEOUT

class VolcengineClient(BaseImageClient):
    def __init__(self, is_po_xian: bool = False):
        if is_po_xian:
            env_base = settings.VOLCENGINE_POXIAN_API_BASE
            self.api_key = settings.VOLCENGINE_POXIAN_API_KEY
        else:
            env_base = settings.VOLCENGINE_API_BASE
            self.api_key = settings.VOLCENGINE_API_KEY
        
        env_base = env_base.split("/contents/")[0].rstrip('/')
        self.base_url = env_base if env_base.endswith("/images/generations") else f"{env_base}/images/generations"

    def _get_resolution(self, size_str: str, ratio: str) -> str:
        if size_str == "2K":
            return {"1:1": "2048x2048", "3:4": "1728x2304", "4:3": "2304x1728", "16:9": "2560x1440", "9:16": "1440x2560"}.get(ratio, "2048x2048")
        elif size_str == "4K":
            return {"1:1": "4096x4096", "4:3": "4096x3072", "3:4": "3072x4096", "16:9": "3840x2160", "9:16": "2160x3840"}.get(ratio, "4096x4096")
        return "2048x2048"

    async def generate(self, client: httpx.AsyncClient, prompt: str, model: str, aspect_ratio: str, image_size: str, image_urls=None, **kwargs):
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        payload = {
            "model": model,
            "prompt": prompt,
            "response_format": "url",
            "size": self._get_resolution(image_size, aspect_ratio),
            "stream": False,
        }

        # 🌟 直接使用传入的图片 URL 列表
        if image_urls:
            # 兼容处理：如果只有一张图，传字符串；如果是多张图，传列表
            payload["image"] = image_urls[0] if len(image_urls) == 1 else image_urls

        try:
            res = await client.post(self.base_url, headers=headers, json=payload)
            res.raise_for_status()
            result = res.json()
            urls = [item.get("url") for item in result.get("data", []) if item.get("url")]
            if urls:
                return urls, "Success"
            return None, f"API Error: {result}"
        except Exception as e:
            return None, f"Volcengine Error: {str(e)}"