// src/agent/infrastructure/agentApiClient.js

import { agentService } from '../../services/api';

/**
 * Agent API Client
 *
 * 作用：
 * 1. 让 agent/application 不直接依赖全局 services/api
 * 2. 后续如果 Agent API 要独立拆分，只改这里
 * 3. 保持当前业务逻辑完全不变
 */
export const agentApiClient = {
    createConversation: (payload, shareToken) =>
        agentService.createConversation(payload, shareToken),

    listConversations: (projectId, shareToken) =>
        agentService.listConversations(projectId, shareToken),

    getConversation: (conversationId, shareToken) =>
        agentService.getConversation(conversationId, shareToken),

    sendMessage: (conversationId, payload, shareToken) =>
        agentService.sendMessage(conversationId, payload, shareToken),

    submitToolResults: (conversationId, payload, shareToken) =>
        agentService.submitToolResults(conversationId, payload, shareToken),

    deleteConversation: (conversationId, shareToken) =>
        agentService.deleteConversation(conversationId, shareToken),

    listSkills: (shareToken) =>
        agentService.listSkills(shareToken),

    sendMessageStream: (conversationId, payload, shareToken, handlers = {}) =>
        agentService.sendMessageStream(
            conversationId,
            payload,
            shareToken,
            handlers,
        ),

    submitToolResultsStream: (conversationId, payload, shareToken, handlers = {}) =>
        agentService.submitToolResultsStream(
            conversationId,
            payload,
            shareToken,
            handlers,
        ),
};

export default agentApiClient;