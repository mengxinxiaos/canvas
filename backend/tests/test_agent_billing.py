from contextvars import Context
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.endpoints import agent as agent_api
from app.core.deps import get_current_user
from app.models.domain import AgentConversation, Base, Project, User
from app.repositories.conversation import ConversationRepository
from app.services import billing
from app.services.agent.llm import gateway as gateway_module
from app.services.agent.llm.gateway import LLMCompletionRequest, OpenAICompatibleLLMGateway
from app.services.agent.runtime import compaction, recovery


@pytest.fixture
def records(monkeypatch):
    created, finished = [], []

    def begin(**kwargs):
        created.append(kwargs)
        return f"call-{len(created)}"

    def finish(call_id, **kwargs):
        finished.append((call_id, kwargs))

    monkeypatch.setattr(gateway_module, "begin_call", begin)
    monkeypatch.setattr(gateway_module, "finish_call", finish)
    return created, finished


def make_gateway(create, **kwargs):
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return OpenAICompatibleLLMGateway(client, provider="zhenzhen-gpt", **kwargs)


def request():
    return LLMCompletionRequest(model="test-model", messages=[{"role": "user", "content": "private"}], max_tokens=50)


def test_complete_records_trusted_actor_and_original_response(records):
    created, finished = records
    response = {"id": "remote", "cost": "0.00012", "currency": "CNY"}
    gateway = make_gateway(lambda **kwargs: response)
    context = billing.BillingContext("actual-caller", "shared-project", conversation_id="conversation")
    with billing.billing_context(context):
        assert gateway.complete(request()) is response
    assert created[0]["user_id"] == "actual-caller"
    assert created[0]["project_id"] == "shared-project"
    assert created[0]["conversation_id"] == "conversation"
    assert created[0]["operation_id"] == context.operation_id
    assert created[0]["provider"] == "zhenzhen-gpt"
    assert "private" not in str(created)
    assert finished == [("call-1", {"response": response})]
    assert billing.current_billing_context.get() is None


def test_retry_records_each_network_attempt_in_same_operation(records, monkeypatch):
    created, finished = records
    monkeypatch.setattr(recovery.time, "sleep", lambda _: None)
    monkeypatch.setattr(recovery.settings, "AGENT_MAX_RETRIES", 1)

    class RateLimited(Exception):
        status_code = 429

    attempts = []

    def create(**kwargs):
        attempts.append(kwargs)
        if len(attempts) == 1:
            raise RateLimited("rate limit")
        return {"cost": "0.03"}

    with billing.billing_context(billing.BillingContext("caller", "project")):
        make_gateway(create).complete(request())
    assert len(created) == 2
    assert created[0]["operation_id"] == created[1]["operation_id"]
    assert [row["parameters"]["attempt"] for row in created] == [1, 2]
    assert finished[0] == ("call-1", {"status": "failed", "error": "RateLimited"})
    assert finished[1] == ("call-2", {"response": {"cost": "0.03"}})


class FakeStream:
    def __init__(self, chunks):
        self.chunks = chunks
        self.closed = False

    def __iter__(self):
        yield from self.chunks

    def close(self):
        self.closed = True


def test_stream_records_usage_only_chunk_and_does_not_duplicate_cost(records):
    created, finished = records
    stream = FakeStream([
        {"id": "remote", "choices": [{"delta": {"content": "hello"}}]},
        {"choices": [], "usage": {"input_tokens": 20, "output_tokens": 3}},
        {"choices": [], "cost": "0.008", "currency": "CNY"},
        {"choices": []},
    ])
    with billing.billing_context(billing.BillingContext("caller", "project")):
        assert len(list(make_gateway(lambda **kwargs: stream).stream_complete(request()))) == 4
    assert len(created) == len(finished) == 1
    metadata = finished[0][1]["metadata"]
    assert finished[0][1]["status"] == "success"
    assert metadata["cost"] == "0.008"
    assert metadata["currency"] == "CNY"
    assert metadata["usage_json"] == {"input_tokens": 20, "output_tokens": 3}
    assert metadata["provider_request_id"] == "remote"
    assert stream.closed


def test_stream_close_marks_interrupted_without_fabricating_zero(records):
    _, finished = records
    stream = FakeStream([{"choices": [{"delta": {"content": "hello"}}]}, {"cost": "8"}])
    with billing.billing_context(billing.BillingContext("caller", "project")):
        tracked = make_gateway(lambda **kwargs: stream).stream_complete(request())
        next(tracked)
        tracked.close()
    assert stream.closed
    assert finished[0][1]["status"] == "interrupted"
    assert finished[0][1]["metadata"].get("cost") is None


def test_unconsumed_stream_does_not_start_a_paid_request(records):
    created, finished = records

    def unexpected_request(**kwargs):
        raise AssertionError("unconsumed stream must not send a request")

    with billing.billing_context(billing.BillingContext("caller", "project")):
        tracked = make_gateway(unexpected_request).stream_complete(request())
        tracked.close()
    assert created == finished == []


def test_stream_failure_is_not_retried_after_content(records):
    created, finished = records

    class BrokenStream(FakeStream):
        def __iter__(self):
            yield {"choices": [{"delta": {"content": "partial"}}]}
            raise ConnectionError("disconnected")

    stream = BrokenStream([])
    with billing.billing_context(billing.BillingContext("caller", "project")):
        with pytest.raises(ConnectionError):
            list(make_gateway(lambda **kwargs: stream).stream_complete(request()))
    assert len(created) == 1
    assert finished[0][1]["status"] == "failed"
    assert finished[0][1]["error"] == "ConnectionError"
    assert stream.closed


def test_summary_is_metered_separately_under_current_actor(records, monkeypatch):
    created, finished = records
    response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="summary"))])
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **kwargs: response)))
    monkeypatch.setattr(compaction, "create_agent_client", lambda: client)
    with billing.billing_context(billing.BillingContext("caller", "project")):
        assert compaction.summarize_history([{"role": "user", "content": "private"}], "summary-model") == "summary"
    assert created[0]["call_type"] == "history_summary"
    assert created[0]["provider"] == "default"
    assert created[0]["user_id"] == "caller"
    assert finished[0][1]["response"] is response


def test_sse_context_is_reset_between_next_calls_and_on_close():
    actor = billing.BillingContext("caller", "project")
    observed = []

    def events():
        try:
            observed.append(billing.current_billing_context.get())
            yield "first"
            observed.append(billing.current_billing_context.get())
            yield "second"
        finally:
            observed.append(billing.current_billing_context.get())

    iterator = agent_api._billing_events(actor, events())
    # A fresh Context per step mirrors sync SSE iteration in a thread pool.
    assert Context().run(next, iterator) == "first"
    assert billing.current_billing_context.get() is None
    assert Context().run(next, iterator) == "second"
    Context().run(iterator.close)
    assert observed == [actor, actor, actor]
    assert billing.current_billing_context.get() is None


@pytest.fixture
def agent_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    caller = User(id="caller", username="caller", role="user")
    session.add_all([
        caller,
        Project(id="other-project", name="Other", owner_id="other", share_enabled=True, share_token="valid-share", share_permission="edit"),
        AgentConversation(id="conversation", project_id="other-project", created_by="other"),
    ])
    session.commit()
    app = FastAPI()
    app.include_router(agent_api.router, prefix="/api/agent")
    app.dependency_overrides[get_current_user] = lambda: caller
    app.dependency_overrides[agent_api.get_conversation_repo] = lambda: ConversationRepository(session)
    app.dependency_overrides[agent_api.get_db] = lambda: session
    with TestClient(app) as client:
        yield client
    session.close()
    engine.dispose()


@pytest.mark.parametrize("endpoint,payload", [
    ("messages", {"content": "hello"}),
    ("messages/stream", {"content": "hello"}),
    ("tool-results", {"toolResults": []}),
    ("tool-results/stream", {"toolResults": []}),
])
def test_paid_conversation_endpoints_reject_unrelated_project(agent_client, endpoint, payload):
    response = agent_client.post(f"/api/agent/conversations/conversation/{endpoint}", json=payload)
    assert response.status_code == 403


def test_shared_conversation_access_checks_actual_share_token(agent_client):
    assert agent_client.get("/api/agent/conversations/conversation").status_code == 403
    assert agent_client.get(
        "/api/agent/conversations/conversation", headers={"X-Project-Share-Token": "valid-share"},
    ).status_code == 200


def test_stateless_chat_also_checks_project_access_before_paid_call(agent_client):
    response = agent_client.post("/api/agent/chat", json={
        "projectId": "other-project", "messages": [{"role": "user", "content": "hello"}],
    })
    assert response.status_code == 403
