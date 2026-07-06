// frontend/src/hooks/agent/useAgentModels.js

import { useMemo, useState, useCallback } from 'react';
import {
    AGENT_MODELS,
    DEFAULT_AGENT_MODEL_ID,
    getAgentModelById,
    buildAgentModelPayload,
    isValidAgentModelId,
} from '../../../config/constants';

export function useAgentModels() {
    const [selectedModelId, setSelectedModelIdState] = useState(DEFAULT_AGENT_MODEL_ID);

    const availableModels = useMemo(() => {
        return AGENT_MODELS;
    }, []);

    const selectedModel = useMemo(() => {
        return (
            getAgentModelById(selectedModelId) ||
            getAgentModelById(DEFAULT_AGENT_MODEL_ID) ||
            availableModels[0] ||
            null
        );
    }, [selectedModelId, availableModels]);

    const selectedAgentModelPayload = useMemo(() => {
        return buildAgentModelPayload(selectedModel?.id || selectedModelId);
    }, [selectedModel, selectedModelId]);

    const setSelectedModelId = useCallback((nextModelId) => {
        const value = String(nextModelId || '').trim();

        if (!value) {
            setSelectedModelIdState(DEFAULT_AGENT_MODEL_ID);
            return;
        }

        if (!isValidAgentModelId(value)) {
            console.warn('[AgentModels] invalid model ignored:', value);
            return;
        }

        setSelectedModelIdState(value);
    }, []);

    return {
        availableModels,
        selectedModel,
        selectedModelId: selectedModel?.id || DEFAULT_AGENT_MODEL_ID,
        selectedAgentModelPayload,
        setSelectedModelId,
    };
}