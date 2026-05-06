// 引入原生的 ws 库和 Yjs 提供的协同底层工具
const { WebSocketServer } = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const PORT = 1234;

// 创建一个 WebSocket 服务器，监听 1234 端口
const wss = new WebSocketServer({ port: PORT });

// 当有前端项目连进来时，把它交给 Yjs 处理
wss.on('connection', (ws, req) => {
    console.log(`[+] 新用户接入协同房间: ${req.url}`);
    setupWSConnection(ws, req);
});

console.log(`====================================`);
console.log(`🚀 Tapnow 工业级协同服务器已启动`);
console.log(`📡 监听地址: ws://localhost:${PORT}`);
console.log(`====================================`);