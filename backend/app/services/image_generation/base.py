import httpx
from abc import ABC, abstractmethod

class BaseImageClient(ABC):
    @abstractmethod
    async def generate(
        self, 
        client: httpx.AsyncClient, 
        prompt: str, 
        model: str, 
        aspect_ratio: str, 
        image_size: str, 
        uploaded_files=None, 
        **kwargs
    ):
        """
        统一生图接口
        返回: (image_urls_list, status_message)
        注意：传入的 model 应该是去掉供应商后缀的纯模型名（如 nano-banana-2）
        """
        pass