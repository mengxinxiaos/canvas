from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.models.domain import User

#agent相关
from app.repositories.conversation import ConversationRepository
from app.services.agent.runtime.runtime import AgentRuntime
from app.services.agent.service.chat_service import AgentChatService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

def get_agent_chat_service(db: Session = Depends(get_db)) -> AgentChatService:
    repo = ConversationRepository(db)
    # 这里的 Runtime 未来可以通过依赖注入传入 Mock_LLM_Client 用于单元测试
    runtime = AgentRuntime() 
    return AgentChatService(repo=repo, runtime=runtime)