// frontend/src/hooks/agent/useAgentCanvasActionExecutor.js

import { useMemo } from 'react';
import { buildAgentCreateNodePayload } from '../../domain/CanvasNodeFactory';
import {
    getEditableFieldsForNode,
    buildPatchFromEditableOperations,
} from '../../domain/CanvasEditableFields';

import { createAgentActionExecutor } from '../../application/frontend_tools/agentActionExecutor';
import { createNodeHandler } from '../../application/frontend_tools/handlers/createNodeHandler';
import { createReadSelectedNodesHandler } from '../../application/frontend_tools/handlers/readSelectedNodesHandler';
import { createUpdateSelectedNodeHandler } from '../../application/frontend_tools/handlers/updateSelectedNodeHandler';

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMergePatch(base, patch) {
    const result = { ...(base || {}) };

    Object.entries(patch || {}).forEach(([key, value]) => {
        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = deepMergePatch(result[key], value);
        } else {
            result[key] = value;
        }
    });

    return result;
}

function pickSavablePatch(node, patch) {
    const mergedNode = deepMergePatch(node, patch);
    const result = {};

    Object.keys(patch || {}).forEach((key) => {
        result[key] = mergedNode[key];
    });

    return result;
}

function serializeNodeForAgent(node, options = {}) {
    const {
        includeImages = true,
        includeGeometry = true,
        includeGeneration = true,
    } = options;

    const result = {
        id: node.id,
        type: node.type,
        content: node.content ?? null,
        style: node.style || null,
        editableFields: getEditableFieldsForNode(node),
    };

    if (includeImages) {
        result.src = node.src || null;
        result.hasMedia = Boolean(node.src);
        result.media = node.src
            ? {
                url: node.src,
                kind: node.type?.includes('video') ? 'video' : 'image',
            }
            : null;
    }

    if (includeGeometry) {
        result.position = node.position || null;
        result.size = node.size || null;
    }

    if (includeGeneration) {
        result.generation = node.generation || null;
    }

    return result;
}

export function useAgentCanvasActionExecutor(deps) {
    const {
        dispatchAndSave,
        updateNodeStrictAndSave,
        pushHistory,
        setSelection,
        screenToCanvas,
        showToast,
        nodes = [],
        selection = [],
    } = deps;

    const executeAgentAction = useMemo(() => {
        const env = {
            dispatchAndSave,
            updateNodeStrictAndSave,
            pushHistory,
            setSelection,
            screenToCanvas,
            showToast,
            nodes,
            selection,
        };

        const handlers = {
            create_node: createNodeHandler({
                buildAgentCreateNodePayload,
            }),

            read_selected_canvas_nodes: createReadSelectedNodesHandler({
                serializeNodeForAgent,
            }),

            update_selected_canvas_node: createUpdateSelectedNodeHandler({
                buildPatchFromEditableOperations,
                cloneJson,
                deepMergePatch,
                pickSavablePatch,
            }),

            tool_error: async ({ payload }) => ({
                ok: false,
                error: 'TOOL_ARGUMENT_ERROR',
                message: payload.error || '工具参数错误',
            }),
        };

        return createAgentActionExecutor({
            handlers,
            env,
        });
    }, [
        dispatchAndSave,
        updateNodeStrictAndSave,
        pushHistory,
        setSelection,
        screenToCanvas,
        showToast,
        nodes,
        selection,
    ]);

    return {
        executeAgentAction,
    };
}