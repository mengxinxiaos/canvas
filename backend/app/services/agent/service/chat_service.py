# backend/app/services/agent/chat_service.py
# 负责：
# - DB conversation/message 生命周期
# - 调用 AgentHistoryMapper 恢复对话历史
# - Runtime 调用边界
# - frontend tool results 接力
# - assistant 协议消息持久化

from contextlib import closing
from typing import Any

from app.repositories.conversation import ConversationRepository
from app.services.agent.runtime.runtime import AgentRuntime
from app.services.agent.schemas import AgentChatRequest
from app.services.agent.service.history_mapper import AgentHistoryMapper
from app.services.agent.service.frontend_tool_state import FrontendToolState
from app.services.agent.runtime.result import AgentTurnResult


# 把前端传来的 agent_model 转成普通 dict
def _dump_agent_model(agent_model: Any) -> dict[str, Any] | None:
    if isinstance(agent_model, dict):
        return dict(agent_model)

    if hasattr(agent_model, "model_dump"):
        dumped = agent_model.model_dump(exclude_none=True)
        return dumped if isinstance(dumped, dict) else None

    if hasattr(agent_model, "dict"):
        dumped = agent_model.dict(exclude_none=True)
        return dumped if isinstance(dumped, dict) else None

    return None


class AgentChatService:
    def __init__(
        self,
        repo: ConversationRepository,
        runtime: AgentRuntime,
        history_mapper: AgentHistoryMapper | None = None,
        frontend_tool_state: FrontendToolState | None = None,
    ):
        self.repo = repo
        self.runtime = runtime
        self.history_mapper = history_mapper or AgentHistoryMapper()
        self.frontend_tool_state = frontend_tool_state or FrontendToolState()

    def _create_assistant_message_from_runtime_result(
        self,
        *,
        conversation_id: str,
        result: dict,
        agent_model_data: dict[str, Any] | None,
        default_status: str = "completed",
    ):
        """
        将 Runtime 返回结果持久化为 assistant message。

        只负责保存 assistant 消息，不处理业务流程。
        """
        answer = result.get("answer", "")
        status = result.get("status", default_status)
        frontend_actions = result.get("frontendActions", [])
        assistant_message = result.get("assistantMessage")
        
        return self.repo.create_message(
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
            meta_json={
                "status": status,
                "frontendActions": frontend_actions,
                "assistantMessage": assistant_message,
                "agentModel": agent_model_data,
            },
        )
    def _build_agent_chat_request(
        self,
        *,
        project_id: str,
        messages: list[dict[str, Any]],
        context: dict | None,
        skill_names: list | None,
        agent_model_data: dict[str, Any] | None,
    ) -> AgentChatRequest:
        """
        构建 Runtime 所需的 AgentChatRequest。

        只负责 DTO 组装，不访问数据库，不调用 Runtime。
        """
        return AgentChatRequest(
            projectId=project_id,
            messages=messages,
            context=context,
            skillNames=skill_names,
            agentModel=agent_model_data,
        )
    
    def _mark_pending_frontend_tool_message_completed(
        self,
        *,
        pending_msg,
        pending_meta: dict[str, Any],
        assistant_message: dict[str, Any],
        tool_results: list,
        current_user_id: str | None,
        share_token: str | None,
        agent_model_data: dict[str, Any] | None,
    ) -> None:
        """
        将 pending 的前端工具 assistant message 标记为 completed。

        只负责更新原 pending message 的 meta_json。
        """
        pending_meta["status"] = "completed"
        pending_meta["frontendToolResults"] = tool_results
        pending_meta["completedByUserId"] = current_user_id
        pending_meta["shareAccess"] = bool(share_token)
        pending_meta["agentModel"] = agent_model_data

        # 清理旧字段，避免后续继续使用 assistantToolMessage。
        pending_meta.pop("assistantToolMessage", None)

        # 确保主字段还在。
        pending_meta["assistantMessage"] = assistant_message

        self.repo.update_message_meta(pending_msg, pending_meta)

    def process_user_message(
        self,
        conversation_id: str,
        current_user_id: str | None,
        content: str,
        context: dict | None,
        skill_names: list | None,
        agent_model: dict[str, Any] | None = None,
        share_token: str | None = None,
        attachments: list | None = None,
    ) -> dict:

        
        """
        处理用户普通文本对话。
        """
        c = self.repo.get_conversation_by_id(conversation_id)
        if not c:
            raise ValueError("对话不存在")
        
        agent_model_data = _dump_agent_model(agent_model)
        attachment_data = [
            item.model_dump(exclude_none=True) if hasattr(item, "model_dump") else dict(item)
            for item in attachments or []
        ]
        # 1. 保存用户输入
        
        
        self.repo.create_message(
            conversation_id=conversation_id,
            role="user",
            content=content,
            meta_json={
                "userId": current_user_id,
                "skillNames": skill_names or [],
                "agentModel": agent_model_data,
                "shareAccess": bool(share_token),
                "attachments": attachment_data,
            },
        )

        # 2. 读取完整 DB 历史
        db_messages = self.repo.get_messages_by_conversation(conversation_id)

        pending_msg = self.frontend_tool_state.find_pending_message(db_messages)
        if pending_msg:
            raise ValueError("当前对话仍在等待前端工具执行结果，请先完成工具回传")

        # 3. db_messages -> agent_history
        agent_history = self.history_mapper.db_messages_to_agent_history(db_messages)

        # 4. Runtime 推理
        result = self.runtime.chat(
            req=self._build_agent_chat_request(
                project_id=c.project_id,
                messages=agent_history,
                context=context,
                skill_names=skill_names,
                agent_model_data=agent_model_data,
            )
        )

        # 5. 持久化 Runtime 返回
        assistant_msg = self._create_assistant_message_from_runtime_result(
            conversation_id=conversation_id,
            result=result,
            agent_model_data=agent_model_data,
        )

        status = result.get("status", "completed")
        frontend_actions = result.get("frontendActions", [])


        # 6. 会话首句自动命名
        if c.title == "新对话":
            if content.strip():
                self.repo.update_conversation_title(c, content.strip()[:24])
            elif attachment_data:
                self.repo.update_conversation_title(c, "图片识别")

        return {
            "conversation": c,
            "message": assistant_msg,
            "status": status,
            "frontendActions": frontend_actions,
        }

    def process_user_message_stream(
        self,
        conversation_id: str,
        current_user_id: str | None,
        content: str,
        context: dict | None,
        skill_names: list | None,
        agent_model: dict[str, Any] | None = None,
        share_token: str | None = None,
        attachments: list | None = None,
    ):
        c = self.repo.get_conversation_by_id(conversation_id)
        if not c:
            raise ValueError("对话不存在")

        agent_model_data = _dump_agent_model(agent_model)
        attachment_data = [
            item.model_dump(exclude_none=True) if hasattr(item, "model_dump") else dict(item)
            for item in attachments or []
        ]
        self.repo.create_message(
            conversation_id=conversation_id,
            role="user",
            content=content,
            meta_json={
                "userId": current_user_id,
                "skillNames": skill_names or [],
                "agentModel": agent_model_data,
                "shareAccess": bool(share_token),
                "attachments": attachment_data,
            },
        )

        db_messages = self.repo.get_messages_by_conversation(conversation_id)

        pending_msg = self.frontend_tool_state.find_pending_message(db_messages)
        if pending_msg:
            raise ValueError("当前对话仍在等待前端工具执行结果，请先完成工具回传")

        agent_history = self.history_mapper.db_messages_to_agent_history(db_messages)

        req = self._build_agent_chat_request(
            project_id=c.project_id,
            messages=agent_history,
            context=context,
            skill_names=skill_names,
            agent_model_data=agent_model_data,
        )

        final_result = None

        with closing(self.runtime.stream_chat(req=req, allow_tools=True)) as stream:
            for event in stream:
                if event.get("type") == "delta":
                    yield event
                    continue

                if event.get("type") == "final":
                    final_result = event.get("result")
                    break

        if final_result is None:
            final_result = AgentTurnResult.completed().to_dict()

        assistant_msg = self._create_assistant_message_from_runtime_result(
            conversation_id=conversation_id,
            result=final_result,
            agent_model_data=agent_model_data,
        )

        if c.title == "新对话":
            if content.strip():
                self.repo.update_conversation_title(c, content.strip()[:24])
            elif attachment_data:
                self.repo.update_conversation_title(c, "图片识别")


        yield {
            "type": "final",
            "conversation": c,
            "message": assistant_msg,
            "status": final_result.get("status", "completed"),
            "frontendActions": final_result.get("frontendActions", []),
        }    

    def process_frontend_tool_results(
        self,
        conversation_id: str,
        current_user_id: str | None,
        tool_results: list,
        context: dict | None,
        skill_names: list | None,
        agent_model: dict[str, Any] | None = None,
        share_token: str | None = None,
    ) -> dict:
        """
        处理前端工具执行完毕后的回传接力。
        """
        c = self.repo.get_conversation_by_id(conversation_id)
        if not c:
            raise ValueError("对话不存在")

        db_messages = self.repo.get_messages_by_conversation(conversation_id)
        if not db_messages:
            raise ValueError("对话记录为空")
        
        agent_model_data = _dump_agent_model(agent_model)

        # 1. 找到最新 pending assistant message
        pending_msg = self.frontend_tool_state.find_pending_message(db_messages)
        if not pending_msg:
            raise ValueError("没有等待前端工具结果的 Agent 消息")

        pending_meta = dict(pending_msg.meta_json or {})
        assistant_message = self.history_mapper.get_stored_assistant_message(pending_meta)

        if not isinstance(assistant_message, dict):
            raise ValueError("缺少 assistantMessage，无法继续对话")

        if not assistant_message.get("tool_calls"):
            raise ValueError("assistantMessage 中缺少 tool_calls，无法继续对话")

        # 2. 校验 toolResults 是否对应 pending tool_calls
        self.frontend_tool_state.validate_results(
            assistant_message=assistant_message,
            tool_results=tool_results,
        )

        # 3. 格式化前端工具执行结果
        formatted_tool_messages = self.history_mapper.format_frontend_tool_result_messages(tool_results)

        if not formatted_tool_messages:
            raise ValueError("toolResults 为空或格式不正确")

        # 4. 拼装继续对话历史：
        #    旧历史 -> pending assistant tool_calls -> role=tool results
        agent_history = self.history_mapper.db_messages_to_agent_history(
            db_messages,
            stop_before_message_id=pending_msg.id,
        )

        agent_history.append(assistant_message)
        agent_history.extend(formatted_tool_messages)

        # 5. Runtime 继续生成
        result = self.runtime.continue_after_frontend_tools(
             req=self._build_agent_chat_request(
                project_id=c.project_id,
                messages=agent_history,
                context=context,
                skill_names=skill_names,
                agent_model_data=agent_model_data,
            )
        )

        # 6. 更新原 pending assistant message
        self._mark_pending_frontend_tool_message_completed(
            pending_msg=pending_msg,
            pending_meta=pending_meta,
            assistant_message=assistant_message,
            tool_results=tool_results,
            current_user_id=current_user_id,
            share_token=share_token,
            agent_model_data=agent_model_data,
        )

        # 7. 保存继续生成后的最终 assistant message
        final_msg = self._create_assistant_message_from_runtime_result(
            conversation_id=conversation_id,
            result=result,
            agent_model_data=agent_model_data,
            default_status="completed_after_frontend_tool",
        )

        frontend_actions = result.get("frontendActions", [])

        return {
            "conversation": c,
            "message": final_msg,
            "status": result.get("status", "completed"),
            "frontendActions": frontend_actions,
        }
    
    def process_frontend_tool_results_stream(
        self,
        conversation_id: str,
        current_user_id: str | None,
        tool_results: list,
        context: dict | None,
        skill_names: list | None,
        agent_model: dict[str, Any] | None = None,
        share_token: str | None = None,
    ):
        """
        前端工具执行完毕后的流式接力。

        流程：
        1. 找 pending assistant tool_calls message
        2. 校验 tool_results
        3. 拼接历史 + assistant tool_calls + tool result messages
        4. Runtime 流式继续生成
        5. 最终更新 pending message，并保存最终 assistant message
        """
        c = self.repo.get_conversation_by_id(conversation_id)
        if not c:
            raise ValueError("对话不存在")

        db_messages = self.repo.get_messages_by_conversation(conversation_id)
        if not db_messages:
            raise ValueError("对话记录为空")

        agent_model_data = _dump_agent_model(agent_model)

        pending_msg = self.frontend_tool_state.find_pending_message(db_messages)
        if not pending_msg:
            raise ValueError("没有等待前端工具结果的 Agent 消息")

        pending_meta = dict(pending_msg.meta_json or {})
        assistant_message = self.history_mapper.get_stored_assistant_message(pending_meta)

        if not isinstance(assistant_message, dict):
            raise ValueError("缺少 assistantMessage，无法继续对话")

        if not assistant_message.get("tool_calls"):
            raise ValueError("assistantMessage 中缺少 tool_calls，无法继续对话")

        self.frontend_tool_state.validate_results(
            assistant_message=assistant_message,
            tool_results=tool_results,
        )

        formatted_tool_messages = self.history_mapper.format_frontend_tool_result_messages(
            tool_results
        )

        if not formatted_tool_messages:
            raise ValueError("toolResults 为空或格式不正确")

        agent_history = self.history_mapper.db_messages_to_agent_history(
            db_messages,
            stop_before_message_id=pending_msg.id,
        )

        agent_history.append(assistant_message)
        agent_history.extend(formatted_tool_messages)

        req = self._build_agent_chat_request(
            project_id=c.project_id,
            messages=agent_history,
            context=context,
            skill_names=skill_names,
            agent_model_data=agent_model_data,
        )

        final_result = None

        with closing(self.runtime.stream_chat(req=req, allow_tools=True)) as stream:
            for event in stream:
                if event.get("type") == "delta":
                    yield event
                    continue

                if event.get("type") == "final":
                    final_result = event.get("result")
                    break

        if final_result is None:
            final_result = AgentTurnResult.completed().to_dict()

        self._mark_pending_frontend_tool_message_completed(
            pending_msg=pending_msg,
            pending_meta=pending_meta,
            assistant_message=assistant_message,
            tool_results=tool_results,
            current_user_id=current_user_id,
            share_token=share_token,
            agent_model_data=agent_model_data,
        )

        final_msg = self._create_assistant_message_from_runtime_result(
            conversation_id=conversation_id,
            result=final_result,
            agent_model_data=agent_model_data,
            default_status="completed_after_frontend_tool",
        )

        yield {
            "type": "final",
            "conversation": c,
            "message": final_msg,
            "status": final_result.get("status", "completed"),
            "frontendActions": final_result.get("frontendActions", []),
        }