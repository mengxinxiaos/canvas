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
        provider = provider.lower() if provider else ""
        
        if provider == "minimax":
            return MiniMaxClient()
        elif provider == "poxian":
            return VolcengineClient(is_po_xian=True)
        elif provider == "volcengine":
            return VolcengineClient(is_po_xian=False)
        elif provider == "zhenzhen":
            return ZhenZhenClient()
        elif provider == "ali":
            return AliClient()
        else:
            # 兜底逻辑：如果没有匹配到，默认走火山普通版
            return VolcengineClient(is_po_xian=False)