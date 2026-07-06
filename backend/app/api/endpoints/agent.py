# backend/app/api/endpoints/agent.py
# 1. 创建依赖：ConversationRepository、AgentRuntime、AgentChatService
# 2. 接收 HTTP 请求
# 3. 把 Service 返回值格式化成前端需要的结构
import traceback
import json
from fastapi import APIRouter, Depends,Header
from fastapi.responses import StreamingResponse

from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.domain import User, AgentConversation, AgentMessage as AgentMessageModel
from app.services.agent.schemas import (
    AgentChatRequest,
    AgentConversationCreateRequest,
    AgentSendMessageRequest,
    AgentConversationUpdateRequest,
    AgentFrontendToolResultRequest,
)
from app.services.agent.runtime.runtime import AgentRuntime
from app.services.agent.prompt import discover_skills

# 引入我们在 Phase 1 & 2 创建的领域服务层
from app.repositories.conversation import ConversationRepository
from app.services.agent.service.chat_service import AgentChatService
from app.services.project_access import ProjectAccessPolicy
router = APIRouter()

def _sse(event: str, data: dict) -> str:
    return (
        f"event: {event}\n"
        f"data: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"
    )

# ==========================================
# 1. 依赖注入工厂 (Dependency Providers)
# ==========================================
def get_conversation_repo(db: Session = Depends(get_db)) -> ConversationRepository:
    return ConversationRepository(db)

def get_agent_chat_service(repo: ConversationRepository = Depends(get_conversation_repo)) -> AgentChatService:
    runtime = AgentRuntime()
    return AgentChatService(repo=repo, runtime=runtime)

# ==========================================
# 2. DTO 格式化层 (展现层逻辑)
# ==========================================
def _ts(dt):
    return dt.timestamp() if dt else None

def _conversation_to_item(c: AgentConversation):
    return {
        "id": c.id,
        "projectId": c.project_id,
        "title": c.title,
        "createdAt": _ts(c.created_at),
        "updatedAt": _ts(c.updated_at),
    }

def _message_to_item(m: AgentMessageModel):
    meta = m.meta_json or {}
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "attachments": meta.get("attachments", []),
        "status": meta.get("status"),
        "frontendActions": meta.get("frontendActions", []),
        "createdAt": _ts(m.created_at),
    }

# ==========================================
# 3. 极简的 API 路由端点
# ==========================================

@router.get("/skills")
def list_agent_skills(current_user: User = Depends(get_current_user)):
    skills = discover_skills()
    return {
        "code": 0,
        "message": "ok",
        "data": [{"name": s["name"], "preview": s["content"][:300]} for s in skills],
    }

@router.post("/chat")
def agent_chat(
    req: AgentChatRequest,
    current_user: User = Depends(get_current_user),
):
    """纯内存对话，不落库"""
    try:
        runtime = AgentRuntime()
        result = runtime.chat(req)
        return {"code": 0, "message": "ok", "data": result}
    except Exception as e:
        print(traceback.format_exc())
        return {"code": 5000, "message": f"Agent 调用失败: {repr(e)}", "data": None}

@router.post("/conversations")
def create_conversation(
    req: AgentConversationCreateRequest,
    current_user: User | None = Depends(get_current_user),
    share_token: str | None = Header(default=None, alias="X-Project-Share-Token"),
    db: Session = Depends(get_db),
    repo: ConversationRepository = Depends(get_conversation_repo),
):
    access = ProjectAccessPolicy(db)
    access.assert_can_edit(
        project_id=req.projectId,
        current_user=current_user,
        share_token=share_token,
    )

    c = repo.create_conversation(
        req.projectId,
        current_user.id if current_user else None,
        req.title,
    )

    return {
        "code": 0,
        "message": "ok",
        "data": _conversation_to_item(c),
    }

@router.get("/conversations")
def list_conversations(
    projectId: str,
    current_user: User | None = Depends(get_current_user),
    share_token: str | None = Header(default=None, alias="X-Project-Share-Token"),
    db: Session = Depends(get_db),
    repo: ConversationRepository = Depends(get_conversation_repo),
):
    access = ProjectAccessPolicy(db)
    access.assert_can_edit(
        project_id=projectId,
        current_user=current_user,
        share_token=share_token,
    )

    rows = repo.get_conversations_by_project(projectId)

    return {
        "code": 0,
        "message": "ok",
        "data": [_conversation_to_item(c) for c in rows],
    }

@router.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    repo: ConversationRepository = Depends(get_conversation_repo)
):
    c = repo.get_conversation_by_id(conversation_id)
    if not c:
        return {"code": 404, "message": "对话不存在", "data": None}

    messages = repo.get_messages_by_conversation(conversation_id)
    return {
        "code": 0,
        "message": "ok",
        "data": {
            "id": c.id,
            "projectId": c.project_id,
            "title": c.title,
            "createdAt": _ts(c.created_at),
            "updatedAt": _ts(c.updated_at),
            "messages": [_message_to_item(m) for m in messages],
        },
    }

@router.post("/conversations/{conversation_id}/messages")
def send_conversation_message(
    conversation_id: str,
    req: AgentSendMessageRequest,
    current_user: User | None = Depends(get_current_user),
    share_token: str | None = Header(default=None, alias="X-Project-Share-Token"),
    chat_service: AgentChatService = Depends(get_agent_chat_service),
):
    try:
        data = chat_service.process_user_message(
            conversation_id=conversation_id,
            current_user_id=current_user.id if current_user else None,
            content=req.content,
            attachments=req.attachments,
            context=req.context,
            skill_names=req.skillNames,
            agent_model=req.agentModel,
            share_token=share_token,
        )

        return {
            "code": 0,
            "message": "ok",
            "data": {
                "conversation": _conversation_to_item(data["conversation"]),
                "message": _message_to_item(data["message"]),
                "status": data["status"],
                "frontendActions": data["frontendActions"],
            },
        }

    except PermissionError as e:
        return {"code": 403, "message": str(e), "data": None}
    except ValueError as e:
        return {"code": 404, "message": str(e), "data": None}
    except Exception as e:
        return {"code": 5000, "message": f"Agent 调用失败: {repr(e)}", "data": None}

@router.post("/conversations/{conversation_id}/tool-results")
def submit_frontend_tool_results(
    conversation_id: str,
    req: AgentFrontendToolResultRequest,
    current_user: User = Depends(get_current_user),
    chat_service: AgentChatService = Depends(get_agent_chat_service)
):
    try:
        data = chat_service.process_frontend_tool_results(
            conversation_id=conversation_id,
            current_user_id=current_user.id,
            tool_results=req.toolResults,
            context=req.context,
            skill_names=req.skillNames,
            agent_model=req.agentModel,
        )
        return {
            "code": 0, "message": "ok",
            "data": {
                "conversation": _conversation_to_item(data["conversation"]),
                "message": _message_to_item(data["message"]),
                "status": data["status"],
                "frontendActions": data["frontendActions"],
            }
        }
    except ValueError as e:
        return {"code": 400, "message": str(e), "data": None}
    except Exception as e:
        print(traceback.format_exc())
        return {"code": 5000, "message": f"Agent 继续对话失败: {repr(e)}", "data": None}

@router.put("/conversations/{conversation_id}")
def update_conversation(
    conversation_id: str,
    req: AgentConversationUpdateRequest,
    current_user: User = Depends(get_current_user),
    repo: ConversationRepository = Depends(get_conversation_repo)
):
    c = repo.get_conversation_by_id(conversation_id)
    if not c:
        return {"code": 404, "message": "对话不存在", "data": None}
    
    if req.title is not None:
        c = repo.update_conversation_title(c, req.title.strip() or "新对话")

    return {"code": 0, "message": "ok", "data": _conversation_to_item(c)}

@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    repo: ConversationRepository = Depends(get_conversation_repo)
):
    success = repo.delete_conversation_and_messages(conversation_id)
    if not success:
        return {"code": 404, "message": "对话不存在", "data": None}
    
    return {"code": 0, "message": "ok", "data": {"id": conversation_id}}

@router.post("/conversations/{conversation_id}/messages/stream")
def send_conversation_message_stream(
    conversation_id: str,
    req: AgentSendMessageRequest,
    current_user: User | None = Depends(get_current_user),
    share_token: str | None = Header(default=None, alias="X-Project-Share-Token"),
    chat_service: AgentChatService = Depends(get_agent_chat_service),
):
    def event_generator():
        try:
            for event in chat_service.process_user_message_stream(
                conversation_id=conversation_id,
                current_user_id=current_user.id if current_user else None,
                content=req.content,
                attachments=req.attachments,
                context=req.context,
                skill_names=req.skillNames,
                agent_model=req.agentModel,
                share_token=share_token,
            ):
                event_type = event.get("type")

                if event_type == "delta":
                    yield _sse("delta", {
                        "content": event.get("content", ""),
                    })
                    continue

                if event_type == "final":
                    yield _sse("final", {
                        "conversation": _conversation_to_item(event["conversation"]),
                        "message": _message_to_item(event["message"]),
                        "status": event["status"],
                        "frontendActions": event["frontendActions"],
                    })
                    continue

            yield _sse("done", {})

        except Exception as e:
            print(traceback.format_exc())
            yield _sse("error", {
                "message": f"Agent 流式调用失败: {repr(e)}",
            })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

@router.post("/conversations/{conversation_id}/tool-results/stream")
def submit_frontend_tool_results_stream(
    conversation_id: str,
    req: AgentFrontendToolResultRequest,
    current_user: User = Depends(get_current_user),
    share_token: str | None = Header(default=None, alias="X-Project-Share-Token"),
    chat_service: AgentChatService = Depends(get_agent_chat_service),
):
    def event_generator():
        try:
            for event in chat_service.process_frontend_tool_results_stream(
                conversation_id=conversation_id,
                current_user_id=current_user.id,
                tool_results=req.toolResults,
                context=req.context,
                skill_names=req.skillNames,
                agent_model=req.agentModel,
                share_token=share_token,
            ):
                event_type = event.get("type")

                if event_type == "delta":
                    yield _sse("delta", {
                        "content": event.get("content", ""),
                    })
                    continue

                if event_type == "final":
                    yield _sse("final", {
                        "conversation": _conversation_to_item(event["conversation"]),
                        "message": _message_to_item(event["message"]),
                        "status": event["status"],
                        "frontendActions": event["frontendActions"],
                    })
                    continue

            yield _sse("done", {})

        except Exception as e:
            print(traceback.format_exc())
            yield _sse("error", {
                "message": f"Agent 工具接力流式调用失败: {repr(e)}",
            })

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )