# backend/app/repositories/conversation.py
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.models.domain import AgentConversation, AgentMessage

class ConversationRepository:
    """
    Agent 对话仓储层：彻底隔离 SQLAlchemy 的底层 API 调用。
    任何其他 Service 必须通过本类的方法操作持久化数据。
    """
    
    def __init__(self, db: Session):
        self.db = db

    def create_conversation(self, project_id: str, user_id: str, title: str = "新对话") -> AgentConversation:
        c = AgentConversation(project_id=project_id, created_by=user_id, title=title)
        self.db.add(c)
        self.db.commit()
        self.db.refresh(c)
        return c

    def get_conversation_by_id(self, conversation_id: str) -> AgentConversation | None:
        return self.db.query(AgentConversation).filter(AgentConversation.id == conversation_id).first()

    def get_conversations_by_project(self, project_id: str) -> list[AgentConversation]:
        return (
            self.db.query(AgentConversation)
            .filter(AgentConversation.project_id == project_id)
            .order_by(AgentConversation.updated_at.desc(), AgentConversation.created_at.desc())
            .all()
        )

    def update_conversation_title(self, conversation: AgentConversation, title: str) -> AgentConversation:
        conversation.title = title
        self.db.commit()
        self.db.refresh(conversation)
        return conversation

    def delete_conversation_and_messages(self, conversation_id: str) -> bool:
        c = self.get_conversation_by_id(conversation_id)
        if not c:
            return False
        # 批量删除关联消息，防止外键冲突
        self.db.query(AgentMessage).filter(AgentMessage.conversation_id == conversation_id).delete()
        self.db.delete(c)
        self.db.commit()
        return True

    def create_message(self, conversation_id: str, role: str, content: str, meta_json: dict = None) -> AgentMessage:
        msg = AgentMessage(
            conversation_id=conversation_id, 
            role=role, 
            content=content, 
            meta_json=meta_json or {}
        )
        self.db.add(msg)
        self.db.commit()
        self.db.refresh(msg)
        return msg

    def get_messages_by_conversation(self, conversation_id: str) -> list[AgentMessage]:
        return (
            self.db.query(AgentMessage)
            .filter(AgentMessage.conversation_id == conversation_id)
            .order_by(AgentMessage.created_at.asc())
            .all()
        )

    def update_message_meta(self, message: AgentMessage, new_meta: dict) -> AgentMessage:
        message.meta_json = new_meta
        # SQLAlchemy 针对 JSON 字段修改的强制标记
        flag_modified(message, "meta_json") 
        self.db.commit()
        self.db.refresh(message)
        return message

    def get_conversation_by_id(self, conversation_id: str):
        return (
            self.db.query(AgentConversation)
            .filter(AgentConversation.id == conversation_id)
            .first()
        )

    def get_conversation_in_project(
        self,
        *,
        conversation_id: str,
        project_id: str,
    ):
        return (
            self.db.query(AgentConversation)
            .filter(
                AgentConversation.id == conversation_id,
                AgentConversation.project_id == project_id,
            )
            .first()
        )