import {
    IMAGE_MODELS,
    VIDEO_MODELS,
    getAvailableModelsByMode,
    getModelConfig,
} from '../../../../config/models.js';

const chooseOption = (options, value, fallback) => {
    const normalized = value == null ? '' : String(value);
    return options.includes(normalized) ? normalized : fallback;
};

/** Keep persisted and edited values inside the selected model's capabilities. */
export function normalizeGenerationParams(params, mode, { inputPicturesCount = 0, hasMediaInput = false } = {}) {
    const imageModel = IMAGE_MODELS.some(model => model.value === params.imageModel)
        ? params.imageModel : IMAGE_MODELS[0].value;
    let videoModel = VIDEO_MODELS.some(model => model.value === params.videoModel)
        ? params.videoModel : VIDEO_MODELS[0].value;
    let videoRefMode = params.videoRefMode || 'first_last';

    if (mode === 'video') {
        if (inputPicturesCount >= 3 || hasMediaInput) videoRefMode = 'multi_ref';
        let available = getAvailableModelsByMode('video', videoRefMode);
        if (available.length === 0) {
            // Older nodes can retain a mode no longer offered by any provider.
            const preferredModel = VIDEO_MODELS.find(model => model.value === videoModel);
            videoRefMode = preferredModel.supportedModes?.[0] || 'first_last';
            available = getAvailableModelsByMode('video', videoRefMode);
        }
        if (!available.some(model => model.value === videoModel)) videoModel = available[0].value;
    }

    const imageConfig = getModelConfig('image', imageModel);
    const videoConfig = getModelConfig('video', videoModel);
    const activeConfig = mode === 'image' ? imageConfig : videoConfig;
    return {
        ...params,
        imageModel,
        videoModel,
        imageSize: chooseOption(imageConfig.sizes, params.imageSize, imageConfig.defaultSize),
        aspectRatio: chooseOption(activeConfig.ratios, params.aspectRatio, activeConfig.defaultRatio),
        duration: chooseOption(videoConfig.durations, params.duration, videoConfig.defaultDuration),
        resolution: chooseOption(videoConfig.resolutions, params.resolution, videoConfig.defaultResolution),
        gridMode: params.gridMode || 'standard',
        imageStyle: params.imageStyle || 'custom',
        videoRefMode,
    };
}

export function createGenerationParams(generation, mode, referenceContext) {
    return normalizeGenerationParams({
        imageModel: mode === 'image' ? generation.model : undefined,
        videoModel: mode === 'video' ? generation.model : undefined,
        imageSize: generation.imageSize,
        aspectRatio: generation.aspectRatio,
        duration: generation.duration,
        resolution: generation.resolution,
        gridMode: generation.gridMode,
        imageStyle: generation.imageStyle,
        videoRefMode: generation.videoRefMode,
    }, mode, referenceContext);
}

/** Slider positions represent allowed values, including models with gaps such as 5/10s. */
export function getManualDurations(durations = []) {
    return [...new Set(durations.map(String))]
        .filter(value => Number.isFinite(Number(value)) && Number(value) > 0)
        .sort((left, right) => Number(left) - Number(right));
}
