from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Text,Boolean
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