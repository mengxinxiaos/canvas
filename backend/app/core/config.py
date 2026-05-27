from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional

class Settings(BaseSettings):
    APP_NAME: str = "Tapnow Backend"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = True
    
    # ==========================================
    # 🚨 强制必填项 (无默认值)
    # 如果 .env 或环境变量中没有这些值，应用启动时会直接报错阻止运行
    # ==========================================
    
    SECRET_KEY: str 
    CORS_ORIGINS: str
    DATABASE_URL: str
    MEDIA_ROOT: str

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 
    
    IMAGE_API_BASE: Optional[str] = None
    IMAGE_API_KEY: Optional[str] = None
    IMAGE_API_KEY_GPT: Optional[str] = None

    VOLCENGINE_API_BASE: Optional[str] = None
    VOLCENGINE_API_KEY: Optional[str] = None
    VOLCENGINE_POXIAN_API_BASE: Optional[str] = None
    VOLCENGINE_POXIAN_API_KEY: Optional[str] = None
    
    MINIMAX_API_BASE: Optional[str] = None
    MINIMAX_API_KEY: Optional[str] = None
    
    DASHSCOPE_API_KEY: str | None = None
    ALIYUN_API_KEY: str | None = None

    OSS_REGION: Optional[str] = None
    OSS_BUCKET_NAME: Optional[str] = None
    OSS_ENDPOINT: Optional[str] = None
    OSS_ACCESS_KEY_ID: Optional[str] = None
    OSS_ACCESS_KEY_SECRET: Optional[str] = None
    OSS_URL_PREFIX: Optional[str] = None
    
    # 忽略.env中未声明的变量，防止报错
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def get_cors_origins(self) -> List[str]:
        return [x.strip() for x in self.CORS_ORIGINS.split(",") if x.strip()]

settings = Settings()