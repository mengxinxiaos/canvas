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
        provider_key = str(provider_name or "zhenzhen").strip().lower()
        client_builder = cls._registry.get(provider_key)
        if not client_builder:
            raise ValueError(f"不支持的图片供应商: {provider_name}")

        client = client_builder()
        client._reset_billing(provider=provider_key)
        return client
