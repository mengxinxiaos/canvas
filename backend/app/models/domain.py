from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Text,Boolean, Index
from sqlalchemy.orm import declarative_base
from sqlalchemy.sql import func
import uuid

Base = declarative_base()

def generate_id(prefix: str):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: generate_id("u"))
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    display_name = Column(String)
    role = Column(String, default="user")
    created_at = Column(DateTime, server_default=func.now())

class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, default=lambda: generate_id("p"))
    name = Column(String)
    owner_id = Column(String, ForeignKey("users.id"))
    viewport_json = Column(JSON, default={"x": 0, "y": 0, "zoom": 1})
    content_json = Column(JSON, default={"nodes": [], "edges": []})
    version = Column(Integer, default=1) 
    thumbnail = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())

    is_folder = Column(Boolean, default=False)
    parent_id = Column(String, nullable=True)

    # 新增：真实分享凭证，不要只放前端
    share_token = Column(String, unique=True, index=True, nullable=True)
    share_enabled = Column(Boolean, default=False)
    share_permission = Column(String, default="edit")  # 当前可固定 edit，为未来扩展预留

class Media(Base):
    __tablename__ = "media"
    id = Column(String, primary_key=True, default=lambda: generate_id("m"))
    project_id = Column(String, ForeignKey("projects.id"))
    relative_path = Column(String)
    mime_type = Column(String)

class Task(Base):
    __tablename__ = "tasks"
    id = Column(String, primary_key=True, default=lambda: generate_id("t"))
    project_id = Column(String, ForeignKey("projects.id"))
    node_id = Column(String)
    task_type = Column(String)
    status = Column(String, default="pending")
    request_json = Column(JSON, nullable=True)
    result_json = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    user_id = Column(String, nullable=True)
    api_call_id = Column(String, nullable=True)


class APICall(Base):
    """Provider evidence and frozen pricing, retained after project/message deletion.

    Decimal amounts are stored as text to preserve provider precision in SQLite.
    Raw supplier costs and locally calculated amounts are stored separately.
    """
    __tablename__ = "api_call_records"
    __table_args__ = (
        Index("ix_api_calls_started_id", "started_at", "id"),
        Index("ix_api_calls_user_started", "user_id", "started_at"),
        Index("ix_api_calls_project_started", "project_id", "started_at"),
    )

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    operation_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=True)
    user_name = Column(String, nullable=True)
    project_id = Column(String, nullable=True)
    project_name = Column(String, nullable=True)
    node_id = Column(String, nullable=True)
    task_id = Column(String, nullable=True)
    conversation_id = Column(String, nullable=True)
    call_type = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    model = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    cost = Column(Text, nullable=True)
    currency = Column(String, nullable=True)
    cost_status = Column(String, nullable=False, default="pending")
    provider_cost = Column(Text, nullable=True)
    provider_currency = Column(String, nullable=True)
    billing_model = Column(String, nullable=True)
    pricing_snapshot = Column(JSON, nullable=True)
    usage_json = Column(JSON, nullable=True)
    provider_request_id = Column(String, nullable=True)
    parameters_json = Column(JSON, nullable=True)
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)

class AgentConversation(Base):
    __tablename__ = "agent_conversations"

    id = Column(String, primary_key=True, default=lambda: generate_id("ac"))
    project_id = Column(String, ForeignKey("projects.id"), index=True, nullable=False)

    # 创建人只用于记录，不用于权限隔离
    created_by = Column(String, ForeignKey("users.id"), nullable=True)

    title = Column(String, default="新对话")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AgentMessage(Base):
    __tablename__ = "agent_messages"

    id = Column(String, primary_key=True, default=lambda: generate_id("am"))
    conversation_id = Column(String, ForeignKey("agent_conversations.id"), index=True, nullable=False)

    # user / assistant
    role = Column(String, nullable=False)

    content = Column(Text, nullable=False)

    # 用来以后保存画布上下文、模型名、token、错误信息等
    meta_json = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
