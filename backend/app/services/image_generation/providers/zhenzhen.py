import asyncio
import inspect
import httpx
from app.core.config import settings
from app.services.image_generation.base import BaseImageClient
from app.services.image_generation.utils import _get_resolution_gpt_image

class ZhenZhenClient(BaseImageClient):
    def __init__(self):
        super().__init__(provider="zhenzhen")
        base = (settings.ZHENZHEN_API_BASE or "https://ai.t8star.cn").rstrip("/")
        if base.endswith("/v1"):
            base = base[:-3].rstrip("/")
        self.base_url = base
        self.api_url = f"{self.base_url}/v1/images/generations"
        self.task_url_prefix = f"{self.base_url}/v1/images/tasks"
        self.api_key = settings.ZHENZHEN_API_KEY
        # 轮询接口不需要长连接等待，用普通短超时即可
        self.timeout = httpx.Timeout(connect=10.0, read=None, write=None, pool=10.0)

        if not self.api_key:
            raise ValueError("ZHENZHEN_API_KEY is not configured for ZhenZhen")
    
    def _build_api_key(self,model):
        if "gpt" in model.lower():
            return settings.ZHENZHEN_API_KEY_GPT
        else:
            return settings.ZHENZHEN_API_KEY

    def _build_headers(self, api_key=None):
        target_key = api_key or self.api_key
        return {
            "Authorization": f"Bearer {target_key}",
            "Content-Type": "application/json",
        }

    def _build_payload(self, prompt, model, aspect_ratio, image_size, image_urls):
        payload = {
            "prompt": prompt,
            "model": model,  
            "response_format": "url",
        }

        safe_model = (model or "").lower()

        if "gpt" in safe_model:
            payload["quality"] = "high"
            payload["size"] = _get_resolution_gpt_image(image_size, aspect_ratio)
            print(f"   👉 image_size: {image_size}")
            print(f"   👉 aspect_ratio: {aspect_ratio}")
            print(f"   👉 size: {payload['size']}")
            
        else:
            payload["aspect_ratio"] = aspect_ratio or "1:1"
            if "nano-banana" in safe_model:
                payload["image_size"] = image_size or "1K"

        if image_urls:
            payload["image"] = image_urls
            
        return payload

    async def generate(self, client: httpx.AsyncClient, prompt: str, model: str, aspect_ratio: str, image_size: str, image_urls=None, **kwargs):
        self._reset_billing(model=model)
        try:
            # 1. 创建任务
            actual_api_key = self._build_api_key(model)
            header = self._build_headers(actual_api_key)
            payload = self._build_payload(prompt, model, aspect_ratio, image_size, image_urls)
            res = await client.post(
                self.api_url,
                headers = header,
                params={"async": "true"},
                json=payload,
                timeout= self.timeout,
            )
            if res.status_code != 200:
                return None, {"code": "API_REQUEST_FAILED", "message": f"创建异步任务失败（HTTP {res.status_code}）"}
            
            submitted = res.json()
            task_id = submitted.get("task_id") or submitted.get("id")
            if not task_id:
                return None, {"code": "MISSING_TASK_ID", "message": "接口未返回 task_id"}

            self.provider_request_id = str(task_id)
            self._capture_billing(submitted)
            on_submitted = kwargs.get("on_submitted")
            if on_submitted:
                notified = on_submitted(
                    provider_request_id=self.provider_request_id,
                    metadata=dict(self.billing_metadata),
                )
                if inspect.isawaitable(notified):
                    await notified

            # 2. 轮询结果
            max_attempts = 180 
            for _ in range(max_attempts):
                await asyncio.sleep(5)
                query_res = await client.get(f"{self.task_url_prefix}/{task_id}", headers = header, timeout=self.timeout)
                
                if query_res.status_code != 200:
                    return None, {"code": "QUERY_FAILED", "message": f"查询失败（HTTP {query_res.status_code}）"}
                
                result = query_res.json()
                self._capture_billing(result)
                outer_data = result.get("data", {})
                status = str(outer_data.get("status", "")).lower()

                if result.get("code") not in (None, "success"):
                    return None, {"code": "PLATFORM_EXCEPTION", "message": "供应商响应异常，请联系管理员核对调用记录。"}

                if status in ("success",):
                    self.generation_succeeded = True
                    urls = self._extract_urls(outer_data.get("data"))
                    if urls:
                        self.billing_metadata.setdefault("usage_json", {})["image_count"] = len(urls)
                        # 成功时，也统一返回约定的格式
                        return urls, {"code": "SUCCESS", "message": "Success"}
                    return None, {"code": "NO_URL_PARSED", "message": "任务成功但未解析到图片URL"}

                if status in ("failure", "failed", "error"):
                    fail_reason = outer_data.get('fail_reason', '未知原因')
                    return None, {"code": "TASK_FAILED", "message": f"平台任务失败: {fail_reason}"}

            # 轮询结束还没成功，直接 return
            return None, {"code": "POLL_TIMEOUT", "message": "轮询次数耗尽未能获取结果"}

        except Exception as e:
            # 这里只用来兜底不可预期的系统级异常（例如断网、DNS解析失败）
            return None, {"code": "UNKNOWN_CLIENT_ERROR", "message": f"ZhenZhen Client Error: {str(e)}"}

    def _extract_urls(self, actual_data):
        urls = []
        if isinstance(actual_data, dict):
            inner_list = actual_data.get("data")
            if isinstance(inner_list, list):
                for item in inner_list:
                    if isinstance(item, dict) and item.get("url"):
                        urls.append(item["url"])
            elif actual_data.get("url"):
                urls.append(actual_data["url"])
        elif isinstance(actual_data, list):
            for item in actual_data:
                if isinstance(item, dict) and item.get("url"):
                    urls.append(item["url"])
        return urls
