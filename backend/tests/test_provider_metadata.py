"""Provider billing regression tests; all HTTP requests use an in-memory transport."""
import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("SECRET_KEY", "provider-test-secret")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("MEDIA_ROOT", "/tmp/canvas-provider-tests")

import httpx

from app.core.config import settings
from app.services.image_generation.providers.zhenzhen import ZhenZhenClient as ImageZhenZhen
from app.services.image_generation.providers.volcengine import VolcengineClient as ImageVolcengine
from app.services.video_generation.providers.zhenzhen import ZhenZhenClient as VideoZhenZhen
from app.services.video_generation.providers.volcengine import VolcengineClient as VideoVolcengine
from app.services.image_generation.factory import ImageClientFactory
from app.services.video_generation.factory import ClientFactory


class ProviderBillingTests(unittest.IsolatedAsyncioTestCase):
    async def test_image_cost_comes_from_final_response_and_task_id_is_published_early(self):
        submitted = []
        events = []

        def respond(request):
            events.append(request.method)
            if request.method == "POST":
                return httpx.Response(200, json={"task_id": "image-upstream-1"})
            self.assertEqual(submitted[0]["provider_request_id"], "image-upstream-1")
            return httpx.Response(200, json={
                "code": "success",
                "data": {
                    "status": "success", "cost": "0.025", "currency": "CNY",
                    "data": {"data": [{"url": "https://example.invalid/1.png"},
                                       {"url": "https://example.invalid/2.png"}]},
                },
            })

        with patch.object(settings, "ZHENZHEN_API_KEY", "test-key"), patch(
            "app.services.image_generation.providers.zhenzhen.asyncio.sleep", new_callable=AsyncMock
        ):
            provider = ImageZhenZhen()
            async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
                urls, _ = await provider.generate(
                    client, "test", "nano-banana-2", "1:1", "1K",
                    on_submitted=lambda **values: submitted.append(values),
                )

        self.assertEqual(events, ["POST", "GET"])
        self.assertEqual(len(urls), 2)
        self.assertTrue(provider.generation_succeeded)
        self.assertEqual(provider.billing_metadata["cost"], "0.025")
        self.assertEqual(provider.billing_metadata["currency"], "CNY")
        self.assertEqual(provider.billing_metadata["usage_json"]["image_count"], 2)

    async def test_submitted_cost_survives_poll_response_that_omits_cost(self):
        def respond(request):
            if request.method == "POST":
                return httpx.Response(200, json={
                    "id": "video-upstream-1", "cost": "0.5", "currency": "CNY",
                })
            return httpx.Response(200, json={
                "status": "succeeded",
                "content": {"video_url": "https://example.invalid/video.mp4"},
            })

        with patch.object(settings, "ZHENZHEN_API_KEY", "test-key"):
            provider = VideoZhenZhen()
            async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
                task_id, _ = await provider.submit_task(client, "test", "seedance")
                status, _ = await provider.query_status(client, task_id)

        self.assertEqual(status, "Success")
        self.assertTrue(provider.generation_succeeded)
        self.assertEqual(provider.provider_request_id, "video-upstream-1")
        self.assertEqual(provider.billing_metadata["cost"], "0.5")
        self.assertEqual(provider.billing_metadata["cost_status"], "reported")

    async def test_explicit_zero_cost_is_preserved_when_success_has_no_url(self):
        def respond(request):
            return httpx.Response(200, json={
                "status": "succeeded", "cost": 0, "content": {},
            })

        with patch.object(settings, "ZHENZHEN_API_KEY", "test-key"):
            provider = VideoZhenZhen()
            async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
                status, _ = await provider.query_status(client, "video-upstream-2")

        self.assertEqual(status, "Failed")  # Delivery failed, upstream generation succeeded.
        self.assertTrue(provider.generation_succeeded)
        self.assertEqual(provider.billing_metadata["cost"], "0")

    async def test_volcengine_missing_cost_remains_unknown_and_metadata_is_not_shared(self):
        with patch.object(settings, "VOLCENGINE_API_BASE", "https://example.invalid/v3"), patch.object(
            settings, "VOLCENGINE_API_KEY", "test-key"
        ):
            first = ImageVolcengine()
            second = ImageVolcengine()
            async with httpx.AsyncClient(transport=httpx.MockTransport(
                lambda _: httpx.Response(200, json={
                    "id": "image-upstream-2", "usage": {"total_tokens": 42},
                    "data": [{"url": "https://example.invalid/image.png"}],
                })
            )) as client:
                await first.generate(client, "test", "seedream", "1:1", "2K")

        self.assertTrue(first.generation_succeeded)
        self.assertIsNone(first.billing_metadata["cost"])
        self.assertEqual(first.billing_metadata["usage_json"]["total_tokens"], 42)
        self.assertEqual(second.billing_metadata, {})

    def test_unknown_provider_does_not_silently_charge_a_different_supplier(self):
        with self.assertRaises(ValueError):
            ImageClientFactory.get_client("unknown")
        with self.assertRaises(ValueError):
            ClientFactory.get_client("unknown")

    async def test_malformed_responses_keep_cost_out_of_user_facing_errors(self):
        response = {"cost": "123.456789", "currency": "CNY", "status": "succeeded", "data": []}
        with patch.object(settings, "ZHENZHEN_API_KEY", "test-key"), patch.object(
            settings, "VOLCENGINE_API_BASE", "https://example.invalid/v3"
        ), patch.object(settings, "VOLCENGINE_API_KEY", "test-key"):
            async with httpx.AsyncClient(transport=httpx.MockTransport(
                lambda _: httpx.Response(200, json=response)
            )) as client:
                image = ImageVolcengine()
                _, message = await image.generate(client, "test", "seedream", "1:1", "2K")
                self.assertNotIn("123.456789", str(message))
                self.assertEqual(image.billing_metadata["cost"], "123.456789")
                for provider in (VideoZhenZhen(), VideoVolcengine(is_po_xian=False)):
                    _, message = await provider.submit_task(client, "test", "seedance")
                    self.assertNotIn("123.456789", str(message))
                    self.assertEqual(provider.billing_metadata["cost"], "123.456789")


if __name__ == "__main__":
    unittest.main()
