from .base import BaseImageClient
from .providers.zhenzhen import ZhenZhenClient
from .providers.volcengine import VolcengineClient

class ImageClientFactory:
    # 注册表：将提供商名称映射到对应的类
    _registry = {
        "zhenzhen": ZhenZhenClient,
        "volcengine": lambda: VolcengineClient(is_po_xian=False),
        "poxian": lambda: VolcengineClient(is_po_xian=True),
        # "baidu": BaiduClient,  # 将来只需在这里加一行
    }

    @classmethod
    def get_client(cls, provider_name: str) -> BaseImageClient:
        """
        根据供应商名称返回对应的实例。
        """
        provider_key = provider_name.lower()
        client_builder = cls._registry.get(provider_key)
        
        if not client_builder:
            print(f"⚠️ 未知供应商 '{provider_name}'，降级使用默认供应商 'zhenzhen'")
            client_builder = cls._registry["zhenzhen"]
            
        # 如果注册的是类本身，直接实例化；如果是 lambda，则调用执行
        if isinstance(client_builder, type):
            return client_builder()
        return client_builder()