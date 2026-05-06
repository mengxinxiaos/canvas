// config/presets.js
export const VIDEO_REFERENCE_MODES = [
    { value: 'first_last', label: '首尾帧' },
    { value: 'multi_ref', label: '全能参考' }
];

export const GRID_MODES = [
    { value: 'standard', label: '标准' },
    { value: 'four_grid', label: '四宫格' },
    { value: 'nine_grid', label: '九宫格' }
];

export const IMAGE_STYLES = [
    { value: 'custom', label: '自定义', displayLabel: '自定义', prompt: "" },
    { value: 'ue', label: 'UE', displayLabel: 'UE风格', prompt: "Ultra-realistic 3D game style, Unreal Engine rendering, No Text." },
    { value: 'realistic', label: '写实', displayLabel: '写实', prompt: "Cinematic, photorealistic, 8k resolution, highly detailed, No Text." },
];

// 媒体类型枚举
export const MEDIA_TYPES = {
    VIDEO: 'video',
    VIDEO_MEDIA: 'video_media',
    AUDIO: 'audio',
    PICTURE: 'picture',
    IMAGE: 'image'
};

// 特殊参数值枚举
export const PARAMS_ENUM = {
    AUTO_RATIO: 'auto',
    FREE_RATIO: 'free',
    AUTO_DURATION: '-1'
};

// 弹窗类型枚举 (避免手写字符串容易拼错)
export const POPOVER_TYPES = {
    PRESET: 'preset',
    PARAMS: 'params',
    MODEL: 'model'
};