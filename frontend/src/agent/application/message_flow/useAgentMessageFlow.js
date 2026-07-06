// frontend/src/hooks/agent/useAgentMessageFlow.js
// 负责：什么时候发、什么时候接流、什么时候跑工具、什么时候报错
import { useCallback, useRef, useState } from 'react';
import { useAgentMessageMutations } from './useAgentMessageMutations';
import {
    MAX_FRONTEND_TOOL_LOOPS,
    makeLocalMessageId,
} from '../controller/agentControllerUtils';

export function useAgentMessageFlow({
    agentService,
    shareToken,

    input,
    setInput,
    
    setMessages,
    ensureConversation,
    applyConversationUpdate,

    executeAgentAction,

    agentAttachments,
    clearAgentAttachments,
    stopPickCanvasImages,

    selectedAgentModelPayload,
    buildSkillNamesForContent,
    getContext,

    clearSkillNames,
    isBlocked,

    onError,
} = {}) {
    const [isLoading, setIsLoading] = useState(false);
    const [isExecutingFrontendTool, setIsExecutingFrontendTool] = useState(false);
    const [isContinuingAfterTool, setIsContinuingAfterTool] = useState(false);
    const {
        appendStreamingAssistantMessage,
        appendUserAndAssistantMessages,
        appendDeltaToMessage,
        replaceMessage,
        removeMessage,
    } = useAgentMessageMutations({
        setMessages,
    });
    const sendLockRef = useRef(false);
    const isMessageFlowBusy = (
        isLoading ||
        isExecutingFrontendTool ||
        isContinuingAfterTool
    );
    
    const runFrontendActions = useCallback(async ({
        conversationId,
        frontendActions,
        latestContext,
        skillNames,
        agentModel,
    }) => {
        if (!frontendActions?.length) return null;

        const toolResults = [];

        setIsExecutingFrontendTool(true);

        try {
            for (const action of frontendActions) {
                try {
                    const result = await executeAgentAction(action);

                    toolResults.push({
                        toolCallId: action.toolCallId,
                        status: 'success',
                        result,
                    });
                } catch (err) {
                    toolResults.push({
                        toolCallId: action.toolCallId,
                        status: 'error',
                        error: err.message || String(err),
                    });
                }
            }
        } finally {
            setIsExecutingFrontendTool(false);
        }

        const tempAssistantId = makeLocalMessageId('assistant-tool-stream');
        appendStreamingAssistantMessage(tempAssistantId);

        let finalPayload = null;
        let streamError = null;

        setIsContinuingAfterTool(true);

        try {
            await agentService.submitToolResultsStream(
                conversationId,
                {
                    toolResults,
                    context: latestContext,
                    skillNames: skillNames || [],
                    agentModel,
                },
                shareToken,
                {
                    onDelta: (data) => {
                        appendDeltaToMessage(tempAssistantId, data?.content || '');
                    },

                    onFinal: (data) => {
                        finalPayload = data;

                        if (data?.message) {
                            replaceMessage(tempAssistantId, data.message);
                        }
                    },

                    onError: (data) => {
                        streamError = new Error(
                            data?.message || 'Agent 工具接力流式请求失败'
                        );
                    },
                },
            );
        } finally {
            setIsContinuingAfterTool(false);
        }

        if (streamError) {
            removeMessage(tempAssistantId);
            throw streamError;
        }

        return finalPayload;
    }, [
        agentService,
        shareToken,
        executeAgentAction,
        appendStreamingAssistantMessage,
        appendDeltaToMessage,
        replaceMessage,
        removeMessage,
    ]);

    const runFrontendToolLoop = useCallback(async ({
        conversationId,
        initialPayload,
        latestContext,
        skillNames,
        agentModel,
    }) => {
        let nextPayload = initialPayload;
        let frontendToolLoopCount = 0;

        while (
            nextPayload?.status === 'requires_frontend_tool' &&
            nextPayload?.frontendActions?.length
        ) {
            frontendToolLoopCount += 1;

            if (frontendToolLoopCount > MAX_FRONTEND_TOOL_LOOPS) {
                throw new Error('Agent 前端工具调用次数过多，已停止，避免无限循环。');
            }

            nextPayload = await runFrontendActions({
                conversationId,
                frontendActions: nextPayload.frontendActions,
                latestContext,
                skillNames,
                agentModel,
            });

            if (nextPayload?.conversation) {
                applyConversationUpdate(nextPayload.conversation);
            }
        }

        return nextPayload;
    }, [
        runFrontendActions,
        applyConversationUpdate,
    ]);

    const sendMessage = useCallback(async () => {
        const content = String(input || '').trim();
        const attachmentsForThisTurn = Array.isArray(agentAttachments)
            ? agentAttachments
            : [];
        const agentModelForThisTurn = selectedAgentModelPayload;

        if (
            (!content && attachmentsForThisTurn.length === 0) ||
            isBlocked ||
            isMessageFlowBusy ||
            sendLockRef.current
        ) {
            return;
        }

        if (
            attachmentsForThisTurn.length > 0 &&
            !agentModelForThisTurn?.capabilities?.multiModal
        ) {
            onError?.('当前模型不支持图片识别，请切换到支持图片的模型后再发送。');
            return;
        }
        sendLockRef.current = true;
        const contextForThisTurn = getContext();
        const skillNamesForThisTurn = buildSkillNamesForContent(content);

        const userMessageId = makeLocalMessageId('user-local');
        const tempAssistantId = makeLocalMessageId('assistant-stream');

        onError?.('');
        setInput('');
        setIsLoading(true);

        appendUserAndAssistantMessages({
            userMessageId,
            assistantMessageId: tempAssistantId,
            content,
            attachments: attachmentsForThisTurn,
        });

        let finalPayload = null;
        let streamError = null;

        try {
            const conversationId = await ensureConversation();

            await agentService.sendMessageStream(
                conversationId,
                {
                    content,
                    attachments: attachmentsForThisTurn,
                    context: contextForThisTurn,
                    skillNames: skillNamesForThisTurn,
                    agentModel: agentModelForThisTurn,
                },
                shareToken,
                {
                    onDelta: (data) => {
                        appendDeltaToMessage(tempAssistantId, data?.content || '');
                    },

                    onFinal: (data) => {
                        finalPayload = data;

                        if (data?.conversation) {
                            applyConversationUpdate(data.conversation);
                        }

                        if (data?.message) {
                            replaceMessage(tempAssistantId, data.message);
                        }
                    },

                    onError: (data) => {
                        streamError = new Error(data?.message || 'Agent 流式请求失败');
                    },
                },
            );

            clearAgentAttachments?.();
            stopPickCanvasImages?.();

            if (streamError) {
                throw streamError;
            }

            await runFrontendToolLoop({
                conversationId,
                initialPayload: finalPayload,
                latestContext: contextForThisTurn,
                skillNames: skillNamesForThisTurn,
                agentModel: agentModelForThisTurn,
            });

            clearSkillNames?.();
        } catch (err) {
            removeMessage(tempAssistantId);
            onError?.(err.message || 'Agent 流式请求失败');
        } finally {
            sendLockRef.current = false;
            setIsLoading(false);
            setIsExecutingFrontendTool(false);
            setIsContinuingAfterTool(false);
        }
    }, [
        input,
        agentAttachments,
        isBlocked,
        isMessageFlowBusy,

        selectedAgentModelPayload,
        getContext,
        buildSkillNamesForContent,
        onError,
        setInput,
        appendUserAndAssistantMessages,
        agentService,
        shareToken,
        appendDeltaToMessage,
        replaceMessage,
        clearAgentAttachments,
        stopPickCanvasImages,
        runFrontendToolLoop,
        clearSkillNames,
        removeMessage,
    ]);

    return {
        isLoading,
        isExecutingFrontendTool,
        isContinuingAfterTool,
        isMessageFlowBusy,

        sendMessage,
        runFrontendActions,
        runFrontendToolLoop,
    };
}