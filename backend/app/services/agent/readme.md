1. 调用链可以理解成：

前端
 ↓
agent.py
  - 接 HTTP 请求
  - 注入 repo/runtime/service
  - 格式化返回
 ↓
chat_service.py
  - 查 conversation
  - 保存 user message
  - 从 DB 还原 history
  - 调用 runtime
  - 保存 assistant message
 ↓
runtime.py
  - 组 system prompt
  - 压缩 history
  - 调 LLM
  - 处理 length / content_filter / tool_calls
  - 返回标准结果
 ↓
chat_service.py
  - 把结果落库
 ↓
agent.py
  - 返回给前端
  
2. 工具调用时是：

runtime.py
  - 发现模型 tool_calls
  - 返回 requires_frontend_tool + frontendActions

chat_service.py
  - 保存 assistant pending 消息

前端
  - 执行 frontendActions
  - 回传 toolResults

agent.py
  - 接收 toolResults

chat_service.py
  - 找 pending message
  - 拼 assistantToolMessage + tool messages
  - 调 runtime.continue_after_frontend_tools()

runtime.py
  - 不再允许继续调用工具
  - 生成最终总结

chat_service.py
  - pending 改 completed
  - 保存最终 assistant message