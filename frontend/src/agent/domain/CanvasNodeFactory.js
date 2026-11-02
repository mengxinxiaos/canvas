// frontend/src/utils/agentCanvasNodeFactory.js

import { generateId } from '../../utils/helpers';

export function getDefaultAgentNodeSize(nodeType, payload = {}) {
    if (nodeType === 'video') {
        return { w: 360, h: 200 };
    }

    if (nodeType === 'image') {
        const ratio = payload.aspectRatio || '1:1';

        if (ratio === '16:9') return { w: 360, h: 203 };
        if (ratio === '9:16') return { w: 203, h: 360 };

        return { w: 360, h: 360 };
    }

    return { w: 300, h: 300 };
}

export function buildAgentCreateNodePayload(action, fallbackPosition) {
    const command = action?.command || {};
    const payload = command.payload || {};

    if (command.type !== 'create_node') {
        throw new Error(`不支持的 Agent command: ${command.type}`);
    }

    const nodeType = payload.nodeType;

    if (!['image', 'video'].includes(nodeType)) {
        throw new Error(`不支持的 Agent 节点类型: ${nodeType}`);
    }

    const position = {
        x: Number.isFinite(payload.x) ? payload.x : fallbackPosition.x,
        y: Number.isFinite(payload.y) ? payload.y : fallbackPosition.y,
    };

    const prompt = payload.prompt || '';

    return {
        id: generateId(),
        type: nodeType,
        position,
        size: getDefaultAgentNodeSize(nodeType, payload),
        content: prompt,
        generation: {
            prompt,
            rawPrompt: prompt,
            aspectRatio: payload.aspectRatio || payload.ratio || '1:1',
            duration: payload.duration,
            source: 'agent',
            toolName: action.toolName,
            toolCallId: action.toolCallId,
        },
        _createdByAgent: true,
    };
}