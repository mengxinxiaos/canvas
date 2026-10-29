from abc import ABC, abstractmethod
import httpx

class BaseVideoClient(ABC):
    def __init__(self, provider: str | None = None):
        self._reset_billing(provider=provider)

    def _reset_billing(self, *, provider: str | None = None, model: str | None = None):
        """Metadata belongs to this generation, never to a shared class dictionary."""
        self.actual_provider = provider or getattr(self, "actual_provider", None)
        self.requested_model = model
        # An endpoint ID in the request is not the model/version returned by the
        # supplier. Keep them separate for matching versioned pricing rules.
        self.actual_model = None
        self.provider_request_id = None
        self.generation_succeeded = False
        self.billing_parameters = {}
        self.billing_metadata = {}

    def _capture_submission_parameters(self, payload: dict):
        """Capture billing selectors from what is actually sent upstream.

        Store counts only; reference URLs and prompt text never enter billing.
        """
        video_count = sum(
            isinstance(item, dict)
            and item.get("type") == "video_url"
            and isinstance(item.get("video_url"), dict)
            and bool(item["video_url"].get("url"))
            for item in payload.get("content", [])
        )
        self.billing_parameters = {
            "resolution": payload.get("resolution"),
            "has_video_input": video_count > 0,
            "video_input_count": video_count,
        }
        self.billing_metadata["parameters_json"] = dict(self.billing_parameters)

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
        if isinstance(response, dict) and isinstance(response.get("model"), str):
            model = response["model"].strip()
            if model:
                self.actual_model = model
        if isinstance(response, dict) and isinstance(response.get("resolution"), str):
            resolution = response["resolution"].strip()
            if resolution:
                # A final response may disclose the actual effective resolution.
                self.billing_parameters["resolution"] = resolution
        if self.actual_model:
            merged["billing_model"] = self.actual_model
        if self.billing_parameters:
            merged["parameters_json"] = dict(self.billing_parameters)
        self.billing_metadata = merged

    @abstractmethod
    async def submit_task(self, client: httpx.AsyncClient, prompt: str, model: str, **kwargs):
        """提交任务，返回 (task_id, message)"""
        pass

    @abstractmethod
    async def query_status(self, client: httpx.AsyncClient, task_id: str):
        """查询状态，返回 (status, result_data)
           status: 'Success' | 'Failed' | 'Processing'
           result_data: 成功时返回 file_id 或 url，失败时返回原因
        """
        pass

    async def get_download_url(self, client: httpx.AsyncClient, result_data):
        """默认直接返回 result_data (URL)，如有额外步骤(如MiniMax)则覆盖"""
        return result_data
