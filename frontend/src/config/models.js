// config/models.js
const BASE_IMAGE_CONFIG = {
    sizes: ["1K", "2K"], defaultSize: "2K",
    ratios: ["auto", "1:1", "3:4", "4:3", "16:9", "9:16", "21:9"], defaultRatio: "auto",
    warning: null
};

const BASE_VIDEO_CONFIG = {
    durations: ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12"], defaultDuration: "5",
    resolutions: ["720p", "1080p"], defaultResolution: "720p",
    ratios: ["auto","16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], defaultRatio: "auto",
    warning: null
};

export const IMAGE_MODELS = [
    { label: "香蕉Pro", value: "nano-banana-2", provider: "zhenzhen", config: { ...BASE_IMAGE_CONFIG } },
    { label: "香蕉2", value: "gemini-3.1-flash-image-preview", provider: "zhenzhen", config: { ...BASE_IMAGE_CONFIG } },
    { label: "GPT图像2 ✨NEW", value: "gpt-image-2", provider: "zhenzhen", 
      config: { ...BASE_IMAGE_CONFIG, sizes: ["1K", "2K", "4K"], defaultSize: "2K", },
    },
    { label: "即梦破限", value: "ep-20260112150903-qplxn", provider: "poxian", config: { ...BASE_IMAGE_CONFIG } }
];

export const VIDEO_MODELS = [
    { 
        label: "即梦 2.0", value: "volcengine-doubao-seedance-2-0-260128", provider: "volcengine", supportedModes: ['multi_ref'],
        config: { ...BASE_VIDEO_CONFIG, durations: ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], defaultDuration: "15", resolutions: ["480p", "720p","1080p"], defaultResolution: "720p", ratios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], defaultRatio: "16:9", warning: { icon: 'info', text: '不支持真人参考.暂不支持视频参考' } }
    },
    
    { 
        label: "即梦 2.0 (zhenzhen)", value: "zhenzhen-doubao-seedance-2-0-260128", provider: "zhenzhen", supportedModes: ['multi_ref'],
        config: { ...BASE_VIDEO_CONFIG, durations: ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], defaultDuration: "15", resolutions: ["480p", "720p","1080p"], defaultResolution: "720p", ratios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], defaultRatio: "16:9", warning: { icon: 'info', text: '不支持真人参考.暂不支持视频参考' } }
    },

    { 
        label: "即梦 2.0 (破限)", value: "poxian-ep-20260414170324-klrk5", provider: "poxian", supportedModes: ['multi_ref'],
        config: { ...BASE_VIDEO_CONFIG, durations: ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], defaultDuration: "15", resolutions: ["480p", "720p","1080p"], defaultResolution: "720p", ratios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], defaultRatio: "16:9", warning: { icon: 'info', text: '不支持真人参考.暂不支持视频参考 ' } }
    },

    { 
        label: "即梦 1.5 Pro", value: "volcengine-doubao-seedance-1-5-pro-251215", provider: "volcengine", supportedModes: ['first_last'],
        config: { ...BASE_VIDEO_CONFIG, warning: { icon: 'info', text: '即梦支持首尾双帧补帧' } }
    },
    { 
        label: "即梦 1.5 Pro (破限)", value: "poxian-seedance-1-5-pro-251215", provider: "poxian", supportedModes: ['first_last'],
        config: { ...BASE_VIDEO_CONFIG, warning: { icon: 'alert', text: '即梦支持首尾双帧补帧; 支持暴力场景', color: 'text-red-400/80' } }
    },
    { 
        label: "海螺 02", value: "minimax-MiniMax-Hailuo-02", provider: "minimax", supportedModes: ['first_last'],
        config: { ...BASE_VIDEO_CONFIG, durations: ["6", "10"], defaultDuration: "6", resolutions: ["768P", "1080P"], defaultResolution: "1080P", warning: { icon: 'info', text: '海螺不支持尾帧; 10秒不支持1080P' } }
    },
    { 
        label: "海螺 2.3", value: "minimax-MiniMax-Hailuo-2.3", provider: "minimax", supportedModes: ['first_last'],
        config: { ...BASE_VIDEO_CONFIG, durations: ["6", "10"], defaultDuration: "6", resolutions: ["768P", "1080P"], defaultResolution: "1080P", warning: { icon: 'info', text: '海螺不支持尾帧; 10秒不支持1080P' } }
    },
    { 
        label: "海螺 2.3 快速", value: "minimax-MiniMax-Hailuo-2.3-fast", provider: "minimax", supportedModes: ['first_last'],
        config: { ...BASE_VIDEO_CONFIG, durations: ["6", "10"], defaultDuration: "6", resolutions: ["768P", "1080P"], defaultResolution: "1080P", warning: { icon: 'info', text: '海螺不支持尾帧; 10秒不支持1080P' } }
    }
];

export const getModelConfig = (mode, modelValue) => {
    const models = mode === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
    const model = models.find(m => m.value === modelValue);
    return model?.config || (mode === 'image' ? BASE_IMAGE_CONFIG : BASE_VIDEO_CONFIG);
};

export const getAvailableModelsByMode = (mode, currentReferenceMode) => {
    const models = mode === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
    if (mode === 'image' || !currentReferenceMode) return models;
    return models.filter(m => !m.supportedModes || m.supportedModes.includes(currentReferenceMode));
};