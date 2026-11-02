from typing import Literal, Optional, Any
from pydantic import BaseModel, Field

class AgentAttachment(BaseModel):
    type: Literal["image"]
    source: Optional[str] = None
    nodeId: Optional[str] = None
    url: str
    name: Optional[str] = None
    mimeType: Optional[str] = None
    
class AgentMessage(BaseModel):
    role: Literal["user", "assistant", "tool"]
    content: str | list[dict[str, Any]] = ""
    reasoning_content: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[list[dict[str, Any]]] = None


class AgentChatRequest(BaseModel):
    projectId: Optional[str] = None
    messages: list[AgentMessage | dict[str, Any]]
    context: Optional[dict[str, Any]] = None
    skillNames: Optional[list[str]] = None
    agentModel: Optional[dict[str, Any]] = None


class AgentChatResponse(BaseModel):
    answer: str
    status: str = "completed"
    frontendActions: list[dict[str, Any]] = Field(default_factory=list)


class AgentConversationCreateRequest(BaseModel):
    projectId: str
    title: Optional[str] = "新对话"


class AgentConversationUpdateRequest(BaseModel):
    title: Optional[str] = None


class AgentSendMessageRequest(BaseModel):
    content: str
    attachments: Optional[list[AgentAttachment]] = None
    context: Optional[dict[str, Any]] = None
    skillNames: Optional[list[str]] = None
    agentModel: Optional[dict[str, Any]] = None


class AgentFrontendToolResultRequest(BaseModel):
    toolResults: list[dict[str, Any]] = Field(default_factory=list)
    context: Optional[dict[str, Any]] = None
    skillNames: Optional[list[str]] = None
    agentModel: Optional[dict[str, Any]] = None
