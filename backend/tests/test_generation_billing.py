"""Generation accounting follows supplier completion, independently of downloads."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints import image_tasks, video_tasks, tasks
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.domain import Base, Project, Task, User
from app.services import image_service, video_service


def _task(task_type, provider="zhenzhen"):
    return SimpleNamespace(
        id="task-1", user_id="caller-1", project_id="project-1", node_id="node-1",
        api_call_id=None, status="pending", task_type=task_type,
        request_json={"provider": provider, "model": "zhenzhen-test-model", "prompt": "test", "mode": "multi_ref", "inputs": []},
    )


def _recording(monkeypatch, module, task, events):
    class HTTPContext:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *args):
            return None

    def update_task(task_id, **values):
        for key, value in values.items():
            setattr(task, key, value)
        events.append(("task", values))
        return task

    def begin(**values):
        events.append(("begin", values))
        return "call-1"

    monkeypatch.setattr(module, "_get_task", lambda _: task)
    monkeypatch.setattr(module.httpx, "AsyncClient", lambda **kwargs: HTTPContext())
    monkeypatch.setattr(module, "_update_task", update_task)
    monkeypatch.setattr(module, "begin_call", begin)
    monkeypatch.setattr(module, "update_call", lambda call_id, **values: events.append(("update", values)))
    monkeypatch.setattr(module, "finish_call", lambda call_id, **values: events.append(("finish", values)))


def test_image_cost_recorded_before_failed_download(monkeypatch):
    task = _task("image_generation")
    events = []
    _recording(monkeypatch, image_service, task, events)

    class Client:
        actual_provider = "zhenzhen"
        billing_metadata = {}
        provider_request_id = None
        generation_succeeded = False

        async def generate(self, **kwargs):
            self.provider_request_id = "upstream-image-1"
            kwargs["on_submitted"](provider_request_id=self.provider_request_id, metadata={})
            self.billing_metadata = {"cost": "0.12", "currency": "CNY", "cost_status": "reported", "usage_json": {"images": 2}}
            self.generation_succeeded = True
            return ["https://example.test/first", "https://example.test/second"], "Success"

    async def download(*args):
        events.append(("download", {}))
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(image_service.ImageClientFactory, "get_client", lambda _: Client())
    monkeypatch.setattr(image_service, "download_to_local", download)
    asyncio.run(image_service.process_image_task(task.id))

    finished = [values for event, values in events if event == "finish"]
    assert len(finished) == 1
    assert finished[0]["status"] == "success"
    assert finished[0]["metadata"]["cost"] == "0.12"
    assert next(i for i, item in enumerate(events) if item[0] == "finish") < next(i for i, item in enumerate(events) if item[0] == "download")
    assert task.status == "failed"  # local failure must not reverse upstream accounting
    assert task.api_call_id == "call-1"
    assert events[1][0] == "begin"
    assert events[1][1]["user_id"] == "caller-1"
    assert any(event == "update" and values["provider_request_id"] == "upstream-image-1" for event, values in events)


def test_video_polling_updates_one_call_and_preserves_cost_after_download_failure(monkeypatch):
    task = _task("video_generation")
    events = []
    _recording(monkeypatch, video_service, task, events)

    class Client:
        actual_provider = "zhenzhen"
        billing_metadata = {}
        provider_request_id = None
        generation_succeeded = False
        polls = 0

        async def submit_task(self, *args, **kwargs):
            self.provider_request_id = "upstream-video-1"
            return self.provider_request_id, "Success"

        async def query_status(self, client, remote_id):
            events.append(("poll", {}))
            self.polls += 1
            if self.polls == 1:
                return "Processing", "running"
            self.billing_metadata = {"cost": "1.23456789", "currency": "CNY", "cost_status": "reported"}
            self.generation_succeeded = True
            return "Success", "https://example.test/video"

        async def get_download_url(self, client, result):
            return result

    async def download(*args):
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr(video_service.ClientFactory, "get_client", lambda _: Client())
    monkeypatch.setattr(video_service.asyncio, "sleep", AsyncMock())
    monkeypatch.setattr(video_service, "download_to_local", download)
    asyncio.run(video_service.process_video_task(task.id))

    assert sum(event == "begin" for event, _ in events) == 1
    assert sum(event == "poll" for event, _ in events) == 2
    finished = [values for event, values in events if event == "finish"]
    assert len(finished) == 1
    assert finished[0]["metadata"]["cost"] == "1.23456789"
    assert finished[0]["status"] == "success"
    assert task.status == "failed"
    assert next(i for i, item in enumerate(events) if item[0] == "update") < next(i for i, item in enumerate(events) if item[0] == "poll")


@pytest.fixture
def generation_api(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    owner = User(id="owner", username="owner")
    caller = User(id="caller", username="caller")
    project = Project(id="project", owner_id="owner", name="shared", share_enabled=True, share_token="valid-share", share_permission="edit")
    db.add_all([owner, caller, project])
    db.commit()

    app = FastAPI()
    app.include_router(image_tasks.router, prefix="/tasks")
    app.include_router(video_tasks.router, prefix="/tasks")
    app.include_router(tasks.router, prefix="/tasks")
    app.dependency_overrides[get_db] = lambda: db
    monkeypatch.setattr(image_tasks, "process_image_task", AsyncMock())
    monkeypatch.setattr(video_tasks, "process_video_task", AsyncMock())
    with TestClient(app) as client:
        yield app, client, db, caller
    db.close()
    engine.dispose()


@pytest.mark.parametrize("endpoint", ["image-generation", "video-generation"])
def test_task_creation_requires_login_and_project_access(generation_api, endpoint):
    app, client, db, caller = generation_api
    payload = {"projectId": "project", "nodeId": "node", "prompt": "test", "user_id": "owner"}
    assert client.post(f"/tasks/{endpoint}", json=payload).status_code == 401
    app.dependency_overrides[get_current_user] = lambda: caller
    assert client.post(f"/tasks/{endpoint}", json=payload).status_code == 403
    response = client.post(f"/tasks/{endpoint}", json=payload, headers={"X-Project-Share-Token": "valid-share"})
    assert response.status_code == 200
    task = db.query(Task).filter(Task.id == response.json()["data"]["taskId"]).one()
    assert task.user_id == "caller"
    assert client.get(f"/tasks/{task.id}").status_code == 403
    response = client.get(f"/tasks/{task.id}", headers={"X-Project-Share-Token": "valid-share"})
    assert response.status_code == 200
    assert "cost" not in response.json()["data"]
    assert "api_call_id" not in response.json()["data"]
