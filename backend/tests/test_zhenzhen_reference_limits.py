"""Generation must preserve every accepted reference and reject overflow."""
import asyncio
import json

import httpx
import pytest

from app.core.config import settings
from app.services.video_generation.providers.zhenzhen import ZhenZhenClient


def submit(monkeypatch, model, **inputs):
    monkeypatch.setattr(settings, "ZHENZHEN_API_KEY", "test-key")
    provider = ZhenZhenClient()
    outgoing = []

    def respond(request):
        outgoing.append(json.loads(request.content))
        return httpx.Response(200, json={"id": "remote-task"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await provider.submit_task(client, "test", model, **inputs)

    result = asyncio.run(run())
    return provider, result, outgoing


@pytest.mark.parametrize("image_count,video_count,audio_count", [(50, 0, 0), (35, 10, 5), (0, 49, 1)])
def test_seedance_25_sends_all_50_references_in_type_order(monkeypatch, image_count, video_count, audio_count):
    images = [f"https://example.invalid/image-{i}.png" for i in range(image_count)]
    videos = [f"https://example.invalid/video-{i}.mp4" for i in range(video_count)]
    audios = [f"https://example.invalid/audio-{i}.mp3" for i in range(audio_count)]
    provider, (task_id, _), outgoing = submit(
        monkeypatch, "doubao-seedance-2.5", image_urls=images, video_urls=videos, audio_urls=audios,
    )
    assert task_id == "remote-task"
    content = outgoing[0]["content"]
    assert len(content) == 51  # one prompt plus 50 references
    for media_type, expected in [("image_url", images), ("video_url", videos), ("audio_url", audios)]:
        assert [item[media_type]["url"] for item in content if item["type"] == media_type] == expected
    assert provider.billing_metadata["parameters_json"]["video_input_count"] == video_count


def test_seedance_25_rejects_51_combined_references_before_network(monkeypatch):
    _, (task_id, message), outgoing = submit(
        monkeypatch, "doubao-seedance-2.5", image_urls=["image"] * 40,
        video_urls=["video"] * 6, audio_urls=["audio"] * 5,
    )
    assert task_id is None
    assert "最多支持 50 个引用资产" in message
    assert "51" in message
    assert outgoing == []


@pytest.mark.parametrize("media_key,count,label", [("image_urls", 10, "图片"), ("video_urls", 4, "视频"), ("audio_urls", 4, "音频")])
def test_other_models_reject_per_type_overflow_without_truncating(monkeypatch, media_key, count, label):
    inputs = {media_key: ["reference"] * count}
    if media_key == "audio_urls":
        inputs["image_urls"] = ["image"]
    _, (task_id, message), outgoing = submit(monkeypatch, "doubao-seedance-2-0-260128", **inputs)
    assert task_id is None
    assert f"个{label}引用" in message
    assert outgoing == []


def test_other_models_keep_their_existing_9_image_3_video_3_audio_capacity(monkeypatch):
    _, (task_id, _), outgoing = submit(
        monkeypatch, "doubao-seedance-2-0-260128", image_urls=["image"] * 9,
        video_urls=["video"] * 3, audio_urls=["audio"] * 3,
    )
    assert task_id == "remote-task"
    assert len(outgoing[0]["content"]) == 16


def test_seedance_25_preserves_first_last_roles_at_50_reference_boundary(monkeypatch):
    _, (task_id, _), outgoing = submit(
        monkeypatch, "doubao-seedance-2.5", first_frame_url="first", last_frame_url="last",
        video_urls=["video"] * 48,
    )
    assert task_id == "remote-task"
    content = outgoing[0]["content"]
    assert len(content) == 51
    assert [item["role"] for item in content if item["type"] == "image_url"] == ["first_frame", "last_frame"]


def test_seedance_25_counts_effective_first_and_last_frames(monkeypatch):
    _, (task_id, message), outgoing = submit(
        monkeypatch, "doubao-seedance-2.5", first_frame_url="first", last_frame_url="last",
        video_urls=["video"] * 49,
    )
    assert task_id is None
    assert "51" in message
    assert outgoing == []


def test_seedance_25_keeps_audio_only_validation(monkeypatch):
    _, (task_id, message), outgoing = submit(monkeypatch, "doubao-seedance-2.5", audio_urls=["audio"])
    assert task_id is None
    assert "至少提供1张图片或1个视频" in message
    assert outgoing == []
