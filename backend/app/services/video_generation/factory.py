from app.services.video_generation.base import BaseVideoClient
from app.services.video_generation.providers.minimax import MiniMaxClient
from app.services.video_generation.providers.volcengine import VolcengineClient
from app.services.video_generation.providers.zhenzhen import ZhenZhenClient
from app.services.video_generation.providers.aliyun import AliClient
#from app.services.video_generation.providers.volc_offical import VolcengineClient



class ClientFactory:
    @staticmethod
    def get_client(provider: str) -> BaseVideoClient:
        """根据前端传入的 provider 字段返回对应的客户端"""
        provider = str(provider or "").strip().lower()
        provider = "ali" if provider == "aliyun" else provider
        if provider == "minimax":
            client = MiniMaxClient()
        elif provider == "poxian":
            client = VolcengineClient(is_po_xian=True)
        elif provider == "volcengine":
            client = VolcengineClient(is_po_xian=False)
        elif provider == "zhenzhen":
            client = ZhenZhenClient()
        elif provider == "ali":
            client = AliClient()
        else:
            raise ValueError(f"不支持的视频供应商: {provider}")
        client._reset_billing(provider=provider)
        return client
