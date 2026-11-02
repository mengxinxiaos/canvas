import { CANVAS_CONFIG } from '../../config/canvas.config';

const COMMON_GEOMETRY_FIELDS = [
    {
        path: 'position.x',
        label: 'X 坐标',
        valueType: 'number',
        min: -100000,
        max: 100000,
    },
    {
        path: 'position.y',
        label: 'Y 坐标',
        valueType: 'number',
        min: -100000,
        max: 100000,
    },
    {
        path: 'size.w',
        label: '宽度',
        valueType: 'number',
        min: CANVAS_CONFIG.NODE.LIMITS.MIN_WIDTH,
        max: CANVAS_CONFIG.NODE.LIMITS.MAX_DIMENSION,
    },
    {
        path: 'size.h',
        label: '高度',
        valueType: 'number',
        min: CANVAS_CONFIG.NODE.LIMITS.MIN_HEIGHT_FREE,
        max: CANVAS_CONFIG.NODE.LIMITS.MAX_DIMENSION,
    },
];

const TEXT_STYLE_FIELDS = [
    {
        path: 'style.fontSize',
        label: '字号',
        valueType: 'number',
        min: CANVAS_CONFIG.NODE.TEXT.MIN_FONT_SIZE,
        max: CANVAS_CONFIG.NODE.TEXT.MAX_FONT_SIZE,
    },
    {
        path: 'style.bold',
        label: '加粗',
        valueType: 'boolean',
    },
    {
        path: 'style.align',
        label: '对齐方式',
        valueType: 'enum',
        enumValues: ['left', 'center', 'right'],
    },
    {
        path: 'style.color',
        label: '文字颜色',
        valueType: 'string',
    },
    {
        path: 'style.bgColor',
        label: '背景色',
        valueType: 'string',
    },
];

const GENERATION_PROMPT_FIELDS = [
    {
        path: 'generation.prompt',
        label: '用户输入的生成提示词',
        valueType: 'string',
        syncPaths: ['generation.rawPrompt'],
    },
];

const GENERATION_REFERENCE_FIELDS = [
    {
        path: 'generation.inputs',
        label: '引用媒体输入',
        valueType: 'array',
    },
    {
        path: 'generation.referenceNodeIds',
        label: '引用节点 ID 列表',
        valueType: 'array',
    },
];

const EDITABLE_FIELDS_BY_TYPE = {
    text: [
        {
            path: 'content',
            label: '文本内容',
            valueType: 'string',
        },
        ...TEXT_STYLE_FIELDS,
        ...COMMON_GEOMETRY_FIELDS,
    ],

    picture: [
        {
            path: 'src',
            label: '图片 URL',
            valueType: 'string',
        },
        {
            path: 'style.bgColor',
            label: '背景色',
            valueType: 'string',
        },
        ...COMMON_GEOMETRY_FIELDS,
    ],

    video_media: [
        {
            path: 'src',
            label: '视频 URL',
            valueType: 'string',
        },
        ...COMMON_GEOMETRY_FIELDS,
    ],

    image: [
        {
            path: 'src',
            label: '生成结果图片 URL',
            valueType: 'string',
        },
        ...GENERATION_PROMPT_FIELDS,
        {
            path: 'generation.model',
            label: '图片生成模型',
            valueType: 'string',
        },
        {
            path: 'generation.aspectRatio',
            label: '图片比例',
            valueType: 'string',
        },
        {
            path: 'generation.imageSize',
            label: '图片尺寸参数',
            valueType: 'string',
        },
        {
            path: 'generation.gridMode',
            label: '网格模式',
            valueType: 'string',
        },
        {
            path: 'generation.imageStyle',
            label: '图片风格',
            valueType: 'string',
        },
        ...GENERATION_REFERENCE_FIELDS,
        ...COMMON_GEOMETRY_FIELDS,
    ],

    video: [
        {
            path: 'src',
            label: '生成结果视频 URL',
            valueType: 'string',
        },
        ...GENERATION_PROMPT_FIELDS,
        {
            path: 'generation.model',
            label: '视频生成模型',
            valueType: 'string',
        },
        {
            path: 'generation.aspectRatio',
            label: '视频比例',
            valueType: 'string',
        },
        {
            path: 'generation.duration',
            label: '视频时长',
            valueType: 'string',
        },
        {
            path: 'generation.resolution',
            label: '视频分辨率',
            valueType: 'string',
        },
        {
            path: 'generation.videoRefMode',
            label: '视频引用模式',
            valueType: 'string',
        },
        {
            path: 'generation.apiMode',
            label: '生成 API 模式',
            valueType: 'string',
        },
        ...GENERATION_REFERENCE_FIELDS,
        ...COMMON_GEOMETRY_FIELDS,
    ],
};

export function getValueByPath(object, path) {
    return String(path || '')
        .split('.')
        .reduce((current, key) => {
            if (current == null) return undefined;
            return current[key];
        }, object);
}

export function setValueByPath(object, path, value) {
    const keys = String(path || '').split('.').filter(Boolean);
    if (!keys.length) return object;

    const root = { ...(object || {}) };
    let cursor = root;

    for (let i = 0; i < keys.length - 1; i += 1) {
        const key = keys[i];
        const next = cursor[key];

        cursor[key] = Array.isArray(next)
            ? [...next]
            : {
                ...(next && typeof next === 'object' ? next : {}),
            };

        cursor = cursor[key];
    }

    cursor[keys[keys.length - 1]] = value;

    return root;
}

export function getEditableFieldsForNode(node) {
    const fields = EDITABLE_FIELDS_BY_TYPE[node?.type] || COMMON_GEOMETRY_FIELDS;

    return fields.map((field) => ({
        ...field,
        value: getValueByPath(node, field.path),
    }));
}

export function validateEditableValue(field, value) {
    if (!field) {
        return {
            ok: false,
            error: 'FIELD_NOT_EDITABLE',
            message: '该字段不允许被 Agent 修改。',
        };
    }

    if (field.valueType === 'string' && typeof value !== 'string') {
        return {
            ok: false,
            error: 'INVALID_VALUE_TYPE',
            message: `${field.path} 需要字符串。`,
        };
    }

    if (field.valueType === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return {
                ok: false,
                error: 'INVALID_VALUE_TYPE',
                message: `${field.path} 需要数字。`,
            };
        }

        if (typeof field.min === 'number' && value < field.min) {
            return {
                ok: false,
                error: 'VALUE_TOO_SMALL',
                message: `${field.path} 不能小于 ${field.min}。`,
            };
        }

        if (typeof field.max === 'number' && value > field.max) {
            return {
                ok: false,
                error: 'VALUE_TOO_LARGE',
                message: `${field.path} 不能大于 ${field.max}。`,
            };
        }
    }

    if (field.valueType === 'boolean' && typeof value !== 'boolean') {
        return {
            ok: false,
            error: 'INVALID_VALUE_TYPE',
            message: `${field.path} 需要布尔值。`,
        };
    }

    if (field.valueType === 'array' && !Array.isArray(value)) {
        return {
            ok: false,
            error: 'INVALID_VALUE_TYPE',
            message: `${field.path} 需要数组。`,
        };
    }

    if (field.valueType === 'enum' && !field.enumValues?.includes(value)) {
        return {
            ok: false,
            error: 'INVALID_ENUM_VALUE',
            message: `${field.path} 只允许这些值：${field.enumValues.join(', ')}`,
        };
    }

    return {
        ok: true,
    };
}

export function buildPatchFromEditableOperations(node, operations = []) {
    const editableFields = getEditableFieldsForNode(node);
    const editableFieldMap = new Map(
        editableFields.map((field) => [field.path, field])
    );

    let patch = {};

    for (const operation of operations || []) {
        const path = String(operation?.path || '').trim();

        if (!path) {
            return {
                ok: false,
                error: 'EMPTY_PATH',
                message: 'operation.path 不能为空。',
            };
        }

        const field = editableFieldMap.get(path);
        const validation = validateEditableValue(field, operation.value);

        if (!validation.ok) {
            return {
                ok: false,
                ...validation,
                path,
            };
        }

        patch = setValueByPath(patch, path, operation.value);
        if (Array.isArray(field.syncPaths)) {
            field.syncPaths.forEach((syncPath) => {
                patch = setValueByPath(patch, syncPath, operation.value);
            });
        }
    }

    return {
        ok: true,
        patch,
        editableFields,
    };
}