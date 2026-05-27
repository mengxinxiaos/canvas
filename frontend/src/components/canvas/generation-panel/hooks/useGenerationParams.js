import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    IMAGE_MODELS,
    VIDEO_MODELS,
    getModelConfig,
    getAvailableModelsByMode
} from '../../../../config/constants';

const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0].value;
const DEFAULT_VIDEO_MODEL = VIDEO_MODELS[0].value;

export function useGenerationParams(
    anchorNode,
    mode,
    updateNodeData,
    inputPicturesCount = 0,
    hasMediaInput = false
) {
    const initVidMode = anchorNode.generation?.videoRefMode || 'first_last';

    let initImgModel = mode === 'image' && anchorNode.generation?.model
        ? anchorNode.generation.model
        : DEFAULT_IMAGE_MODEL;

    let initVidModel = mode === 'video' && anchorNode.generation?.model
        ? anchorNode.generation.model
        : DEFAULT_VIDEO_MODEL;

    if (mode === 'video') {
        const availableInitModels = getAvailableModelsByMode('video', initVidMode);
        const isValid = availableInitModels.some(m => m.value === initVidModel);

        if (!isValid && availableInitModels.length > 0) {
            initVidModel = availableInitModels[0].value;
        }
    }

    const imgConfig = getModelConfig('image', initImgModel);
    const vidConfig = getModelConfig('video', initVidModel);

    const [params, setParams] = useState({
        imageModel: initImgModel,
        videoModel: initVidModel,
        imageSize: anchorNode.generation?.imageSize || imgConfig.defaultSize,
        aspectRatio: anchorNode.generation?.aspectRatio || (
            mode === 'image' ? imgConfig.defaultRatio : vidConfig.defaultRatio
        ),
        duration: anchorNode.generation?.duration || vidConfig.defaultDuration,
        resolution: anchorNode.generation?.resolution || vidConfig.defaultResolution,
        gridMode: anchorNode.generation?.gridMode || 'standard',
        imageStyle: anchorNode.generation?.imageStyle || 'custom',
        videoRefMode: anchorNode.generation?.videoRefMode || 'first_last',
    });

    const stateRef = useRef(params);
    const generationRef = useRef(anchorNode.generation || {});

    useEffect(() => {
        stateRef.current = params;
    }, [params]);

    useEffect(() => {
        generationRef.current = anchorNode.generation || {};
    }, [anchorNode.generation]);

    const currentModelId = mode === 'image'
        ? params.imageModel
        : params.videoModel;

    const config = useMemo(() => {
        return getModelConfig(mode, currentModelId);
    }, [mode, currentModelId]);

    const updateParam = useCallback((key, value) => {
        setParams(prev => {
            const next = {
                ...prev,
                [key]: value,
            };

            if (key === 'imageModel' || key === 'videoModel') {
                const newConfig = getModelConfig(mode, value);

                if (mode === 'image') {
                    if (!newConfig.sizes.includes(prev.imageSize)) {
                        next.imageSize = newConfig.defaultSize;
                    }

                    if (!newConfig.ratios.includes(prev.aspectRatio)) {
                        next.aspectRatio = newConfig.defaultRatio;
                    }
                } else {
                    if (!newConfig.durations.includes(prev.duration)) {
                        next.duration = newConfig.defaultDuration;
                    }

                    if (!newConfig.resolutions.includes(prev.resolution)) {
                        next.resolution = newConfig.defaultResolution;
                    }

                    if (!newConfig.ratios.includes(prev.aspectRatio)) {
                        next.aspectRatio = newConfig.defaultRatio;
                    }
                }
            }

            if (key === 'videoRefMode' && mode === 'video') {
                const availableModels = getAvailableModelsByMode('video', value);
                const isCurrentModelValid = availableModels.some(m => m.value === prev.videoModel);

                if (!isCurrentModelValid && availableModels.length > 0) {
                    next.videoModel = availableModels[0].value;

                    const newConfig = getModelConfig('video', next.videoModel);

                    if (!newConfig.durations.includes(prev.duration)) {
                        next.duration = newConfig.defaultDuration;
                    }

                    if (!newConfig.resolutions.includes(prev.resolution)) {
                        next.resolution = newConfig.defaultResolution;
                    }

                    if (!newConfig.ratios.includes(prev.aspectRatio)) {
                        next.aspectRatio = newConfig.defaultRatio;
                    }
                }
            }

            return next;
        });
    }, [mode]);

    useEffect(() => {
        if (mode !== 'video') return;

        const shouldForceMultiRef = inputPicturesCount >= 3 || hasMediaInput;

        if (shouldForceMultiRef && params.videoRefMode !== 'multi_ref') {
            updateParam('videoRefMode', 'multi_ref');
        }
    }, [
        inputPicturesCount,
        hasMediaInput,
        mode,
        params.videoRefMode,
        updateParam
    ]);

    const syncToNode = useCallback((overrides = {}) => {
        if (!updateNodeData) return;

        const s = {
            ...stateRef.current,
            ...overrides,
        };

        const prevGeneration = generationRef.current || {};
        const currentModel = mode === 'image' ? s.imageModel : s.videoModel;

        const nextGeneration = {
            ...prevGeneration,

            model: currentModel,
            aspectRatio: s.aspectRatio,
            imageSize: s.imageSize,
            duration: s.duration,
            resolution: s.resolution,
            gridMode: s.gridMode,
            imageStyle: s.imageStyle,
            videoRefMode: s.videoRefMode,

            prompt: s.prompt !== undefined
                ? s.prompt
                : prevGeneration.prompt,
        };

        // 关键：引用资产数据只有明确传入时才写。
        // 参数更新、关闭面板、普通 prompt 保存，不应该默认覆盖引用顺序。
        if (overrides.inputs !== undefined) {
            nextGeneration.inputs = overrides.inputs;
        }

        if (overrides.referenceNodeIds !== undefined) {
            nextGeneration.referenceNodeIds = overrides.referenceNodeIds;
        }

        if (overrides.rawPrompt !== undefined) {
            nextGeneration.rawPrompt = overrides.rawPrompt;
        }

        if (overrides.finalPrompt !== undefined) {
            nextGeneration.finalPrompt = overrides.finalPrompt;
        }

        if (overrides.apiMode !== undefined) {
            nextGeneration.apiMode = overrides.apiMode;
        }

        updateNodeData(anchorNode.id, {
            generation: nextGeneration,
        });

        // 关键：立即刷新 ref，避免下一次 syncToNode 又拿旧 generation。
        generationRef.current = nextGeneration;
    }, [
        anchorNode.id,
        mode,
        updateNodeData
    ]);

    return {
        params,
        updateParam,
        syncToNode,
        config,
    };
}