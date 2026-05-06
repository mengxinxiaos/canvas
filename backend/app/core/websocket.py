from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    def __init__(self):
        # 记录每个项目房间里的活跃连接：{ project_id: [websocket1, websocket2, ...] }
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, project_id: str):
        await websocket.accept()
        if project_id not in self.active_connections:
            self.active_connections[project_id] = []
        self.active_connections[project_id].append(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str):
        if project_id in self.active_connections:
            self.active_connections[project_id].remove(websocket)
            if not self.active_connections[project_id]:
                del self.active_connections[project_id]

    async def broadcast(self, message: dict, project_id: str):
        """向指定项目房间内的所有客户端广播消息"""
        if project_id in self.active_connections:
            for connection in self.active_connections[project_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    # 如果发送失败（比如连接已断开），直接忽略
                    pass

# 实例化一个全局管理器
manager = ConnectionManager()