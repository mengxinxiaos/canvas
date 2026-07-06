
import { useCallback, useMemo, useState } from 'react';
import { agentApiClient as defaultAgentService } from '../../infrastructure/agentApiClient';

import { useAgentSkills } from '../skills/useAgentSkills';
import { useAgentModels } from '../models/useAgentModels';
import {
    extractSkillNamesFromInput,
    mergeSkillNamesInOrder,
    useAgentSkillMentions,
} from '../skills/useAgentSkillMentions';

import { useAgentConversation } from '../conversation/useAgentConversation';
import { useAgentAttachments } from '../attachments/useAgentAttachments';
import { useAgentMessageFlow } from '../message_flow/useAgentMessageFlow';
import { buildAgentContext } from '../controller/agentControllerUtils';

export function useCanvasAgentController({
    user,
    projectId,
    projectName,
    nodes,
    edges,
    selection,
    executeAgentAction,
    shareToken,

    agentService = defaultAgentService,
}) {
    const [input, setInput] = useState('');
    const [selectedSkillNames, setSelectedSkillNames] = useState([]);
    const [error, setError] = useState('');

    const {
        availableModels,
        selectedModel,
        selectedModelId,
        selectedAgentModelPayload,
        setSelectedModelId,
    } = useAgentModels();

    const {
        skills: availableSkills,
        isLoadingSkills,
        skillsError,
        refreshSkills,
    } = useAgentSkills({ shareToken });

    const {
        mentionedSkillNames,
        skillNamesForTurn: previewSkillNamesForTurn,
    } = useAgentSkillMentions({
        input,
        availableSkills,
        selectedSkillNames,
    });

    const getContext = useCallback(() => {
        return buildAgentContext({
            user,
            projectId,
            projectName,
            nodes,
            edges,
            selection,
        });
    }, [
        user,
        projectId,
        projectName,
        nodes,
        edges,
        selection,
    ]);

    const addSkillName = useCallback((name) => {
        const skillName = String(name || '').trim();
        if (!skillName) return;

        setSelectedSkillNames((prev) =>
            mergeSkillNamesInOrder(prev, [skillName])
        );
    }, []);

    const removeSkillName = useCallback((name) => {
        const skillName = String(name || '').trim();
        if (!skillName) return;

        setSelectedSkillNames((prev) =>
            prev.filter((item) => item !== skillName)
        );
    }, []);

    const toggleSkillName = useCallback((name) => {
        const skillName = String(name || '').trim();
        if (!skillName) return;

        setSelectedSkillNames((prev) => {
            if (prev.includes(skillName)) {
                return prev.filter((item) => item !== skillName);
            }

            return mergeSkillNamesInOrder(prev, [skillName]);
        });
    }, []);

    const clearSkillNames = useCallback(() => {
        setSelectedSkillNames([]);
    }, []);

    const buildSkillNamesForContent = useCallback((content) => {
        return mergeSkillNamesInOrder(
            selectedSkillNames,
            extractSkillNamesFromInput(content, availableSkills),
        );
    }, [
        selectedSkillNames,
        availableSkills,
    ]);

    const conversation = useAgentConversation({
        projectId,
        shareToken,
        agentService,
        isBlocked: false,
        onError: setError,
    });

    const attachments = useAgentAttachments({
        onError: setError,
    });

    const messageFlow = useAgentMessageFlow({
        agentService,
        shareToken,

        input,
        setInput,

        setMessages: conversation.setMessages,
        ensureConversation: conversation.ensureConversation,
        applyConversationUpdate: conversation.applyConversationUpdate,

        executeAgentAction,

        agentAttachments: attachments.agentAttachments,
        clearAgentAttachments: attachments.clearAgentAttachments,
        stopPickCanvasImages: attachments.stopPickCanvasImages,

        selectedAgentModelPayload,
        buildSkillNamesForContent,
        getContext,

        clearSkillNames,
        isBlocked: conversation.isLoadingConversation,

        onError: setError,
    });

    const isAgentBusy = (
        conversation.isLoadingConversation ||
        messageFlow.isMessageFlowBusy
    );

    const newConversation = useCallback(() => {
        if (isAgentBusy) return;

        const ok = conversation.resetConversation();
        if (!ok) return;

        setInput('');
        setError('');
        clearSkillNames();
        attachments.clearAgentAttachments();
        attachments.stopPickCanvasImages();
    }, [
        isAgentBusy,
        conversation,
        clearSkillNames,
        attachments,
    ]);

    const agentModelSelector = useMemo(() => {
        return {
            models: availableModels,
            selectedModel,
            selectedModelId,
            payload: selectedAgentModelPayload,
            setSelectedModelId,
        };
    }, [
        availableModels,
        selectedModel,
        selectedModelId,
        selectedAgentModelPayload,
        setSelectedModelId,
    ]);

    return {
        conversations: conversation.conversations,
        activeConversationId: conversation.activeConversationId,
        activeConversation: conversation.activeConversation,
        messages: conversation.messages,

        input,
        setInput,

        availableSkills,
        selectedSkillNames,
        mentionedSkillNames,
        previewSkillNamesForTurn,
        addSkillName,
        removeSkillName,
        toggleSkillName,
        clearSkillNames,
        isLoadingSkills,
        skillsError,
        refreshSkills,

        isLoading: messageFlow.isLoading,
        isLoadingList: conversation.isLoadingList,
        isLoadingConversation: conversation.isLoadingConversation,
        isExecutingFrontendTool: messageFlow.isExecutingFrontendTool,
        isContinuingAfterTool: messageFlow.isContinuingAfterTool,
        isMessageFlowBusy: messageFlow.isMessageFlowBusy,
        isAgentBusy,
        error,

        refreshConversations: conversation.refreshConversations,
        sendMessage: messageFlow.sendMessage,
        newConversation,
        openConversation: conversation.openConversation,
        deleteConversation: conversation.deleteConversation,

        agentModelSelector,

        isPickingCanvasImages: attachments.isPickingCanvasImages,
        agentAttachments: attachments.agentAttachments,
        startPickCanvasImages: attachments.startPickCanvasImages,
        stopPickCanvasImages: attachments.stopPickCanvasImages,
        removeAgentAttachment: attachments.removeAgentAttachment,
        addCanvasImageAttachment: attachments.addCanvasImageAttachment,
    };
}