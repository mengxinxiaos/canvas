import { getReferenceType } from '../utils/referenceMedia.js';

const TEMPLATE_BASE_URL = 'https://ai-other-01.oss-cn-hangzhou.aliyuncs.com/templates';
const GRID_TEMPLATES = {
    four_grid: 'four_grid_9_16_template.png',
    nine_grid: 'nine_grid_9_16_template.png',
};

/** Resolve only missing inputs; an explicit empty list means no references. */
export function resolveGenerationInputs(genParams, canvasState, generatorNode) {
    if (Array.isArray(genParams.inputs)) {
        return genParams.inputs.map(input => ({ ...input }));
    }

    const nodesById = new Map(canvasState.nodes.map(node => [node.id, node]));
    const connectedIds = [...new Set(canvasState.edges
        .filter(edge => edge.to === generatorNode.id)
        .map(edge => edge.from))];
    const storedOrder = genParams.referenceNodeIds ?? generatorNode.generation?.referenceNodeIds;
    const savedOrder = Array.isArray(storedOrder) ? storedOrder : [];
    const orderedIds = [...new Set([...savedOrder, ...connectedIds])]
        .filter(id => connectedIds.includes(id));

    return orderedIds.flatMap(id => {
        const node = nodesById.get(id);
        const type = getReferenceType(node);
        return type && node.src ? [{ id, url: node.src, type }] : [];
    });
}

/** System templates belong to the request, never to editable node references. */
export function buildGenerationRequestInputs(referenceInputs, genParams, nodeType) {
    const inputs = referenceInputs.map(input => ({ ...input }));
    const template = GRID_TEMPLATES[genParams.gridMode];

    if (nodeType === 'image' && template && genParams.aspectRatio === '9:16') {
        inputs.push({ url: `${TEMPLATE_BASE_URL}/${template}`, type: 'image' });
    }

    return inputs;
}

/** Keep task submission independent of React state and synchronous rendering. */
export function createGenerationSubmitter({ taskService, imageModels, videoModels }) {
    const submitting = new Set();

    return {
        async submitTask({ projectId, shareToken, genParams, canvasState, updateNodeStrictAndSave, pushHistory, showToast }) {
            const generatorNode = canvasState.nodes.find(node => node.id === genParams.nodeId);
            const submissionKey = JSON.stringify([projectId, genParams.nodeId]);

            if (!generatorNode || generatorNode._isLoading || submitting.has(submissionKey)) return;
            submitting.add(submissionKey);

            try {
                const referenceInputs = resolveGenerationInputs(genParams, canvasState, generatorNode);
                const inputs = buildGenerationRequestInputs(referenceInputs, genParams, generatorNode.type);
                const models = generatorNode.type === 'video' ? videoModels : imageModels;
                const provider = models.find(model => model.value === genParams.model)?.provider ?? 'zhenzhen';
                const editablePrompt = genParams.rawPrompt ?? genParams.prompt;

                pushHistory();
                updateNodeStrictAndSave(generatorNode.id, {
                    _isLoading: true,
                    generation: {
                        ...generatorNode.generation,
                        ...genParams,
                        prompt: editablePrompt,
                        rawPrompt: editablePrompt,
                        finalPrompt: genParams.prompt,
                        inputs: referenceInputs,
                    },
                    _error: null,
                });

                const finalPayload = {
                    ...genParams,
                    projectId,
                    nodeId: generatorNode.id,
                    provider,
                    mode: genParams.apiMode,
                    inputs,
                };
                const result = await (generatorNode.type === 'video'
                    ? taskService.createVideoTask(finalPayload, shareToken)
                    : taskService.createImageTask(finalPayload, shareToken));

                if (!result?.taskId) {
                    showToast?.('创建任务失败：未拿到任务号');
                    updateNodeStrictAndSave(generatorNode.id, { _isLoading: false, _error: '服务器未返回任务号' });
                    return;
                }

                updateNodeStrictAndSave(generatorNode.id, { taskId: result.taskId });
            } catch (error) {
                updateNodeStrictAndSave(generatorNode.id, {
                    _isLoading: false,
                    _error: error.message || '创建任务失败',
                });
            } finally {
                submitting.delete(submissionKey);
            }
        },
    };
}
