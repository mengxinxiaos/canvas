// frontend/src/config/agent_models.js

export const AGENT_MODELS = [
    {
        id: 'runninghub-deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        shortLabel: 'DEEPSEEK',
        model_id: 'deepseek/deepseek-v4-pro',
        provider: 'runninghub',
        description: '通用 Agent 模型，适合日常对话、画布操作、轻量创作任务。',
        capabilities: {
            tools: true,
            reasoning: false,
            multiModal: false,
        },
    },
    {
        id: 'runninghub-glm-5-2',
        label: 'GLM 5.2',
        shortLabel: 'GLM',
        model_id: 'glm-5.2',
        provider: 'runninghub',
        description: '推理 Agent 模型，适合复杂分析、剧本拆解、分镜规划、长链路任务。',
        capabilities: {
            tools: true,
            reasoning: true,
            multiModal: false,
        },
    },
    {
        id: 'runninghub-doubao-seed-evolving',
        label: 'doubao-seed-evolving',
        shortLabel: 'DOUBAO',
        model_id: 'bytedance/doubao-seed-evolving',
        provider: 'runninghub',
        description: '推理 Agent 模型，适合复杂分析、剧本拆解、分镜规划、长链路任务。',
        capabilities: {
            tools: true,
            reasoning: true,
            multiModal: true,
        },
    },
    {
        id: 'zhenzhen-gpt-5.5',
        label: 'gpt-5.5',
        shortLabel: 'GPT',
        model_id: 'gpt-5.5',
        provider: 'zhenzhen-gpt',
        description: '推理 Agent 模型，适合复杂分析、剧本拆解、分镜规划、长链路任务。',
        default: true,
        capabilities: {
            tools: true,
            reasoning: true,
            multiModal: true,
        },
    },
    {
        id: 'zhenzhen-gemini-3.1-pro',
        label: 'gemini-3.1-pro',
        shortLabel: 'GEMINI',
        model_id: 'gemini-3.1-pro-preview',
        provider: 'zhenzhen-gemini',
        description: '推理 Agent 模型，适合复杂分析、剧本拆解、分镜规划、长链路任务。',
        capabilities: {
            tools: true,
            reasoning: true,
            multiModal: true,
        },
    },
];

export const DEFAULT_AGENT_MODEL_ID =
    AGENT_MODELS.find((model) => model.default)?.id ||
    AGENT_MODELS[0]?.id ||
    '';

export const getAgentModelById = (id) => {
    return AGENT_MODELS.find((model) => model.id === id) || null;
};

export const getDefaultAgentModel = () => {
    return getAgentModelById(DEFAULT_AGENT_MODEL_ID) || AGENT_MODELS[0] || null;
};

export const buildAgentModelPayload = (modelId) => {
    const model = getAgentModelById(modelId) || getDefaultAgentModel();

    if (!model) return null;

    return {
        ...model,
        capabilities: {
            ...(model.capabilities || {}),
        },
    };
};

export const isValidAgentModelId = (id) => {
    return AGENT_MODELS.some((model) => model.id === id);
};