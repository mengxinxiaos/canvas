// frontend/src/hooks/agent/useAgentMessageMutations.js
// 负责：messages 数组怎么追加、替换、删除、拼接 delta
import { useCallback } from 'react';

export function useAgentMessageMutations({
    setMessages,
} = {}) {
    const appendStreamingAssistantMessage = useCallback((id) => {
        if (typeof setMessages !== 'function') return;

        setMessages((prev) => [
            ...prev,
            {
                id,
                role: 'assistant',
                content: '',
                status: 'streaming',
            },
        ]);
    }, [setMessages]);

    const appendUserAndAssistantMessages = useCallback(({
        userMessageId,
        assistantMessageId,
        content,
        attachments,
    }) => {
        if (typeof setMessages !== 'function') return;

        setMessages((prev) => [
            ...prev,
            {
                id: userMessageId,
                role: 'user',
                content,
                attachments,
            },
            {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                status: 'streaming',
            },
        ]);
    }, [setMessages]);

    const appendDeltaToMessage = useCallback((messageId, delta) => {
        if (typeof setMessages !== 'function') return;
        if (!messageId || !delta) return;

        setMessages((prev) =>
            prev.map((msg) =>
                msg.id === messageId
                    ? {
                        ...msg,
                        content: `${msg.content || ''}${delta}`,
                    }
                    : msg
            )
        );
    }, [setMessages]);

    const replaceMessage = useCallback((messageId, nextMessage) => {
        if (typeof setMessages !== 'function') return;
        if (!messageId || !nextMessage) return;

        setMessages((prev) =>
            prev.map((msg) =>
                msg.id === messageId
                    ? nextMessage
                    : msg
            )
        );
    }, [setMessages]);

    const removeMessage = useCallback((messageId) => {
        if (typeof setMessages !== 'function') return;
        if (!messageId) return;

        setMessages((prev) =>
            prev.filter((msg) => msg.id !== messageId)
        );
    }, [setMessages]);

    return {
        appendStreamingAssistantMessage,
        appendUserAndAssistantMessages,
        appendDeltaToMessage,
        replaceMessage,
        removeMessage,
    };
}