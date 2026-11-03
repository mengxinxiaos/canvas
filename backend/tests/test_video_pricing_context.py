"""Pricing selectors come from effective requests, never just UI mode names."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.core.config import settings
from app.services import video_service
from app.services.video_generation.base import BaseVideoClient
from app.services.video_generation.providers.volcengine import VolcengineClient
from app.services.video_generation.providers.zhenzhen import ZhenZhenClient


@pytest.mark.parametrize("provider_name", ["volcengine", "poxian", "zhenzhen"])
@pytest.mark.parametrize("video_inputs", [[], ["https://example.invalid/reference.mp4"]])
def test_provider_captures_effective_payload_and_actual_response_model(monkeypatch, provider_name, video_inputs):
    monkeypatch.setattr(settings, "ZHENZHEN_API_KEY", "test-key")
    monkeypatch.setattr(settings, "VOLCENGINE_API_KEY", "test-key")
    monkeypatch.setattr(settings, "VOLCENGINE_POXIAN_API_KEY", "test-key")
    monkeypatch.setattr(settings, "VOLCENGINE_API_BASE", "https://example.invalid/v3")
    monkeypatch.setattr(settings, "VOLCENGINE_POXIAN_API_BASE", "https://example.invalid/v3")
    outgoing = []

    def respond(request):
        import json
        if request.method == "POST":
            outgoing.append(json.loads(request.content))
            return httpx.Response(200, json={"id": "remote-task"})
        return httpx.Response(200, json={
            "id": "remote-task", "status": "succeeded",
            "model": "doubao-seedance-2-0-260128", "resolution": "1080p",
            "duration": 7.5,
            "usage": {"completion_tokens": 35800, "total_tokens": 35800},
            "content": {"video_url": "https://example.invalid/output.mp4"},
        })

    provider = ZhenZhenClient() if provider_name == "zhenzhen" else VolcengineClient(is_po_xian=provider_name == "poxian")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            task_id, _ = await provider.submit_task(
                client, "private prompt", "ep-opaque-request-endpoint",
                resolution="720p", video_urls=video_inputs,
            )
            submitted = dict(provider.billing_metadata)
            assert provider.actual_model is None
            status, _ = await provider.query_status(client, task_id)
        return submitted, status

    submitted, status = asyncio.run(run())
    assert status == "Success"
    assert submitted["parameters_json"] == {
        "resolution": "720p", "has_video_input": bool(video_inputs), "video_input_count": len(video_inputs),
        "duration": 5,
    }
    assert provider.billing_metadata["parameters_json"] == {
        "resolution": "1080p", "has_video_input": bool(video_inputs), "video_input_count": len(video_inputs),
        "duration": 5,
    }
    assert provider.billing_metadata["billing_model"] == "doubao-seedance-2-0-260128"
    assert provider.billing_metadata["usage_json"]["total_tokens"] == 35800
    assert provider.billing_metadata["usage_json"]["duration_seconds"] == "7.5"
    assert outgoing[0]["resolution"] == "720p"
    assert sum(item["type"] == "video_url" for item in outgoing[0]["content"]) == len(video_inputs)
    assert "private prompt" not in str(provider.billing_metadata)
    assert "reference.mp4" not in str(provider.billing_metadata)


def test_zhenzhen_rejects_overflow_instead_of_pricing_a_truncated_payload(monkeypatch):
    monkeypatch.setattr(settings, "ZHENZHEN_API_KEY", "test-key")
    provider = ZhenZhenClient()

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
            lambda _: pytest.fail("An invalid request must not reach the provider")
        )) as client:
            return await provider.submit_task(client, "test", "model", video_urls=["a", "b", "c", "d"])

    task_id, message = asyncio.run(run())
    assert task_id is None
    assert "最多支持 3 个视频" in message
    assert "parameters_json" not in provider.billing_metadata


@pytest.mark.parametrize("requested_mode,image_count,expected_video", [
    ("multi_ref", 0, True),
    ("first_last", 0, False),
    ("first_last", 1, True),
    ("first_last", 2, False),
])
def test_video_service_records_only_reference_videos_forwarded_by_effective_mode(monkeypatch, requested_mode, image_count, expected_video):
    inputs = [{"type": "image", "url": f"https://example.invalid/{i}.png"} for i in range(image_count)]
    inputs.append({"type": "video", "url": "https://example.invalid/reference.mp4"})
    task = SimpleNamespace(
        id="task", user_id="caller", project_id="project", node_id="node", api_call_id=None,
        request_json={"provider": "volcengine", "model": "volcengine-doubao-seedance-2-0-260128",
                      "prompt": "private", "mode": requested_mode, "inputs": inputs},
    )
    records = []
    submissions = []

    class FakeProvider(BaseVideoClient):
        def __init__(self):
            super().__init__(provider="volcengine")

        async def submit_task(self, client, prompt, model, **kwargs):
            submissions.append(kwargs)
            self.provider_request_id = "remote"
            return "remote", "Success"

        async def query_status(self, client, task_id):
            self.generation_succeeded = True
            return "Success", "https://example.invalid/result.mp4"

    class HTTPContext:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *args):
            return None

    monkeypatch.setattr(video_service, "_get_task", lambda _: task)
    monkeypatch.setattr(video_service, "_update_task", lambda *args, **kwargs: None)
    monkeypatch.setattr(video_service, "begin_call", lambda **kwargs: records.append(kwargs) or "call")
    monkeypatch.setattr(video_service, "update_call", lambda *args, **kwargs: None)
    monkeypatch.setattr(video_service, "finish_call", lambda *args, **kwargs: None)
    monkeypatch.setattr(video_service, "download_to_local", AsyncMock(return_value="/media/result.mp4"))
    monkeypatch.setattr(video_service.ClientFactory, "get_client", lambda _: FakeProvider())
    monkeypatch.setattr(video_service.httpx, "AsyncClient", lambda **kwargs: HTTPContext())
    monkeypatch.setattr(video_service.asyncio, "sleep", AsyncMock())
    asyncio.run(video_service.process_video_task("task"))
    assert len(records) == 1
    assert records[0]["parameters"]["has_video_input"] is expected_video
    assert records[0]["parameters"]["video_input_count"] == int(expected_video)
    assert bool(submissions[0].get("video_urls")) is expected_video
