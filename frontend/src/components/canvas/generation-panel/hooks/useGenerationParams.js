import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { IMAGE_MODELS, VIDEO_MODELS, getModelConfig,getAvailableModelsByMode} from '../../../../config/constants';

const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0].value;
const DEFAULT_VIDEO_MODEL = VIDEO_MODELS[0].value;

export function useGenerationParams(anchorNode, mode, updateNodeData,inputPicturesCount = 0, hasMediaInput = false) {

    const initVidMode = anchorNode.generation?.videoRefMode || 'first_last';

    // 1. 初始化逻辑：优先读取节点数据，否则使用默认值
    let initImgModel = (mode === 'image' && anchorNode.generation?.model) ? anchorNode.generation.model : DEFAULT_IMAGE_MODEL;
    let initVidModel = (mode === 'video' && anchorNode.generation?.model) ? anchorNode.generation.model : DEFAULT_VIDEO_MODEL;

    // 🚨 校验：如果默认模型不支持默认模式，立即纠正
    if (mode === 'video') {
        const availableInitModels = getAvailableModelsByMode('video', initVidMode);
        const isValid = availableInitModels.some(m => m.value === initVidModel);
        
        // 如果“即梦2.0”不支持“first_last”，则自动切换到该模式下的第一个可用模型（如即梦1.5 Pro）
        if (!isValid && availableInitModels.length > 0) {
            initVidModel = availableInitModels[0].value;
        }
    }

    const imgConfig = getModelConfig('image', initImgModel);
    const vidConfig = getModelConfig('video', initVidModel);

    // 2. 状态集中管理 (将零散的 state 合并为对象)
    const [params, setParams] = useState({
        imageModel: initImgModel,
        videoModel: initVidModel,
        imageSize: anchorNode.generation?.imageSize || imgConfig.defaultSize,
        aspectRatio: anchorNode.generation?.aspectRatio || (mode === 'image' ? imgConfig.defaultRatio : vidConfig.defaultRatio),
        duration: anchorNode.generation?.duration || vidConfig.defaultDuration,
        resolution: anchorNode.generation?.resolution || vidConfig.defaultResolution,
        gridMode: anchorNode.generation?.gridMode || 'standard',
        imageStyle: anchorNode.generation?.imageStyle || 'custom',
        videoRefMode: anchorNode.generation?.videoRefMode || 'first_last',
    });

    const stateRef = useRef(params);
    const generationRef = useRef(anchorNode.generation);

    // 保持 ref 同步，用于闭包和卸载时的保存
    useEffect(() => { stateRef.current = params; }, [params]);
    useEffect(() => { generationRef.current = anchorNode.generation; }, [anchorNode.generation]);

    // 计算当前配置
    const currentModelId = mode === 'image' ? params.imageModel : params.videoModel;
    const config = useMemo(() => getModelConfig(mode, currentModelId), [mode, currentModelId]);

    // 3. 统一的参数更新方法 (自动处理模型切换时的默认值重置)
    const updateParam = useCallback((key, value) => {
        setParams(prev => {
            const next = { ...prev, [key]: value };
            
            // 拦截 A：当直接切换模型时，检查并重置下属不兼容的参数
            if (key === 'imageModel' || key === 'videoModel') {
                const newConfig = getModelConfig(mode, value);
                if (mode === 'image') {
                    if (!newConfig.sizes.includes(prev.imageSize)) next.imageSize = newConfig.defaultSize;
                    if (!newConfig.ratios.includes(prev.aspectRatio)) next.aspectRatio = newConfig.defaultRatio;
                } else {
                    if (!newConfig.durations.includes(prev.duration)) next.duration = newConfig.defaultDuration;
                    if (!newConfig.resolutions.includes(prev.resolution)) next.resolution = newConfig.defaultResolution;
                    if (!newConfig.ratios.includes(prev.aspectRatio)) next.aspectRatio = newConfig.defaultRatio;
                }
            }

            // 👇 拦截 B (新增逻辑)：当切换视频模式时，校验当前模型是否在新模式下受支持
            if (key === 'videoRefMode' && mode === 'video') {
                const availableModels = getAvailableModelsByMode('video', value);
                const isCurrentModelValid = availableModels.some(m => m.value === prev.videoModel);
                
                // 如果当前选中的模型不在新模式的支持列表里，强制切换为新模式的第一个可用模型
                if (!isCurrentModelValid && availableModels.length > 0) {
                    next.videoModel = availableModels[0].value;
                    
                    // 级联处理：因为模型被动改变了，需要再次校验这个新模型下属的参数（比例/时长/清晰度）
                    const newConfig = getModelConfig('video', next.videoModel);
                    if (!newConfig.durations.includes(prev.duration)) next.duration = newConfig.defaultDuration;
                    if (!newConfig.resolutions.includes(prev.resolution)) next.resolution = newConfig.defaultResolution;
                    if (!newConfig.ratios.includes(prev.aspectRatio)) next.aspectRatio = newConfig.defaultRatio;
                }
            }
            return next;
        });
    }, [mode]);
    
    // 增强自动化拦截监听器
    useEffect(() => {
        if (mode === 'video') {
            // 如果图片 >= 3，或者存在音视频媒体输入，则判定为需要使用多参模式
            const shouldForceMultiRef = inputPicturesCount >= 3 || hasMediaInput;
            
            if (shouldForceMultiRef && params.videoRefMode !== 'multi_ref') {
                updateParam('videoRefMode', 'multi_ref');
            }
        }
    }, [inputPicturesCount, hasMediaInput, mode, params.videoRefMode, updateParam]);

    // 将状态同步到画布节点
    const syncToNode = useCallback((overrides = {}) => {
        if (!updateNodeData) return;
        const s = { ...stateRef.current, ...overrides };
        const currentModel = mode === 'image' ? s.imageModel : s.videoModel;
        
        updateNodeData(anchorNode.id, {
            generation: {
                ...generationRef.current,
                prompt: overrides.prompt !== undefined ? overrides.prompt : generationRef.current?.prompt,
                model: currentModel,
                aspectRatio: s.aspectRatio,
                imageSize: s.imageSize,
                duration: s.duration,
                resolution: s.resolution,
                gridMode: s.gridMode,
                imageStyle: s.imageStyle,
                videoRefMode: s.videoRefMode
            }
        });
    }, [anchorNode.id, mode, updateNodeData]);
  
    return { params, updateParam, syncToNode, config };
}