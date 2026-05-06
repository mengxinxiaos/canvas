from abc import ABC, abstractmethod
import httpx

class BaseVideoClient(ABC):
    @abstractmethod
    async def submit_task(self, client: httpx.AsyncClient, prompt: str, model: str, **kwargs):
        """提交任务，返回 (task_id, message)"""
        pass

    @abstractmethod
    async def query_status(self, client: httpx.AsyncClient, task_id: str):
        """查询状态，返回 (status, result_data)
           status: 'Success' | 'Failed' | 'Processing'
           result_data: 成功时返回 file_id 或 url，失败时返回原因
        """
        pass

    async def get_download_url(self, client: httpx.AsyncClient, result_data):
        """默认直接返回 result_data (URL)，如有额外步骤(如MiniMax)则覆盖"""
        return result_data