// frontend/src/hooks/agent/useAgentConversation.js

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    normalizeMessages,
    sortConversations,
} from '../controller/agentControllerUtils';

export function useAgentConversation({
    projectId,
    shareToken,
    agentService,
    isBlocked,
    onError,
} = {}) {
    const [conversations, setConversations] = useState([]);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const [messages, setMessages] = useState([]);

    const [isLoadingList, setIsLoadingList] = useState(false);
    const [isLoadingConversation, setIsLoadingConversation] = useState(false);

    const activeConversation = useMemo(() => {
        return conversations.find((item) => item.id === activeConversationId) || null;
    }, [conversations, activeConversationId]);

    const applyConversationUpdate = useCallback((conversation) => {
        if (!conversation?.id) return;

        setActiveConversationId(conversation.id);

        setConversations((prev) => {
            const exists = prev.some((item) => item.id === conversation.id);

            return sortConversations(
                exists
                    ? prev.map((item) =>
                        item.id === conversation.id
                            ? {
                                ...item,
                                ...conversation,
                            }
                            : item
                    )
                    : [conversation, ...prev],
            );
        });
    }, []);

    const refreshConversations = useCallback(async () => {
        if (!projectId) return;

        setIsLoadingList(true);
        onError?.('');

        try {
            const list = await agentService.listConversations(projectId, shareToken);
            setConversations(sortConversations(list || []));
        } catch (err) {
            onError?.(err.message || '加载历史对话失败');
        } finally {
            setIsLoadingList(false);
        }
    }, [
        projectId,
        shareToken,
        agentService,
        onError,
    ]);

    const ensureConversation = useCallback(async () => {
        if (activeConversationId) {
            return activeConversationId;
        }

        const created = await agentService.createConversation(
            {
                projectId,
                title: '新对话',
            },
            shareToken,
        );

        applyConversationUpdate(created);

        return created.id;
    }, [
        activeConversationId,
        projectId,
        shareToken,
        agentService,
        applyConversationUpdate,
    ]);

    const openConversation = useCallback(async (conversationId) => {
        if (!conversationId || isBlocked) return;

        onError?.('');
        setIsLoadingConversation(true);

        try {
            const detail = await agentService.getConversation(conversationId, shareToken);

            setActiveConversationId(detail.id);
            setMessages(normalizeMessages(detail.messages || []));

            applyConversationUpdate({
                id: detail.id,
                projectId: detail.projectId,
                title: detail.title,
                createdAt: detail.createdAt,
                updatedAt: detail.updatedAt,
            });
        } catch (err) {
            onError?.(err.message || '打开历史对话失败');
        } finally {
            setIsLoadingConversation(false);
        }
    }, [
        isBlocked,
        shareToken,
        agentService,
        applyConversationUpdate,
        onError,
    ]);

    const deleteConversation = useCallback(async (conversationId) => {
        if (!conversationId || isBlocked) return;

        onError?.('');

        try {
            await agentService.deleteConversation(conversationId, shareToken);

            setConversations((prev) =>
                prev.filter((item) => item.id !== conversationId)
            );

            if (activeConversationId === conversationId) {
                setActiveConversationId(null);
                setMessages([]);
            }
        } catch (err) {
            onError?.(err.message || '删除对话失败');
            throw err;
        }
    }, [
        activeConversationId,
        isBlocked,
        shareToken,
        agentService,
        onError,
    ]);

    const resetConversation = useCallback(() => {
        if (isBlocked) return false;

        setActiveConversationId(null);
        setMessages([]);

        return true;
    }, [isBlocked]);

    useEffect(() => {
        if (!projectId) return;
        refreshConversations();
    }, [
        projectId,
        refreshConversations,
    ]);

    return {
        conversations,
        activeConversationId,
        activeConversation,
        messages,
        setMessages,

        isLoadingList,
        isLoadingConversation,

        refreshConversations,
        ensureConversation,
        openConversation,
        deleteConversation,
        resetConversation,
        applyConversationUpdate,
    };
}