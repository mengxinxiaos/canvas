import httpx
from abc import ABC, abstractmethod

class BaseImageClient(ABC):
    def __init__(self, provider: str | None = None):
        self._reset_billing(provider=provider)

    def _reset_billing(self, *, provider: str | None = None, model: str | None = None):
        """Metadata belongs to this generation, never to a shared class dictionary."""
        self.actual_provider = provider or getattr(self, "actual_provider", None)
        self.actual_model = model
        self.provider_request_id = None
        self.generation_succeeded = False
        self.billing_metadata = {}

    def _capture_billing(self, response):
        from app.services.billing import extract_billing

        incoming = extract_billing(response, provider=self.actual_provider)
        previous = self.billing_metadata
        merged = {**previous, **incoming}
        merged["usage_json"] = {
            **(previous.get("usage_json") or {}),
            **(incoming.get("usage_json") or {}),
        }
        # A later polling response may omit a cost returned at submission time.
        if incoming.get("cost") is None and previous.get("cost") is not None:
            for key in ("cost", "currency", "cost_status"):
                merged[key] = previous.get(key)
        if not incoming.get("currency") and previous.get("currency"):
            merged["currency"] = previous["currency"]
        if not self.provider_request_id and incoming.get("provider_request_id"):
            self.provider_request_id = str(incoming["provider_request_id"])
        if self.provider_request_id:
            merged["provider_request_id"] = self.provider_request_id
        self.billing_metadata = merged
        if isinstance(response, dict) and isinstance(response.get("model"), str):
            self.actual_model = response["model"]

    @abstractmethod
    async def generate(
        self, 
        client: httpx.AsyncClient, 
        prompt: str, 
        model: str, 
        aspect_ratio: str, 
        image_size: str, 
        uploaded_files=None, 
        **kwargs
    ):
        """
        统一生图接口
        返回: (image_urls_list, status_message)
        注意：传入的 model 应该是去掉供应商后缀的纯模型名（如 nano-banana-2）
        """
        pass
