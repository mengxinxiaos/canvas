// 🌍 核心容器：只负责调度数据的流向

import React, {
    useState,
    useEffect,
    useRef,
    useMemo,
    useCallback
} from 'react';

import { usePanelPosition } from './hooks/usePanelPosition';
import { useGenerationParams } from './hooks/useGenerationParams';

import { buildPresetPrompt } from '../../../utils/promptBuilder';
import { getDimensionsByRatio } from '../../../utils/helpers';

import MentionTextarea from './components/MentionTextarea';
import ControlToolbar from './components/ControlToolbar';
import PictureTags from './components/PictureTags';

import { VIDEO_REFERENCE_MODES } from '../../../config/constants';

export default function GenerationPanel({
    mode,
    anchorNode,
    incomingNodes,
    viewport,
    onGenerate,
    updateNodeData,
    onRemoveConnection
}) {
    // 🚀 工业级：定义合法的媒体类型常量，防止硬编码漏删
    const VIDEO_TYPES = ['video', 'video_media', 'video_node'];
    const AUDIO_TYPES = ['audio'];
    const IMAGE_TYPES = ['picture', 'image'];

    const ALL_REFERENCE_TYPES = [
        ...VIDEO_TYPES,
        ...AUDIO_TYPES,
        ...IMAGE_TYPES
    ];

    // 纯计算逻辑：根据节点获取面板的绝对定位样式
    const panelStyle = usePanelPosition(anchorNode, viewport, incomingNodes.length);

    // 维护本地的排序和删除状态
    const [mediaOrderIds, setMediaOrderIds] = useState([]);
    const [deletedMediaIds, setDeletedMediaIds] = useState(new Set());

    // 拖拽排序 / 删除资产后，强制刷新 TipTap 输入框内容
    const [promptForceSyncKey, setPromptForceSyncKey] = useState(0);

    // 创建一个 Ref 用于调用 MentionTextarea 内部的方法
    const mentionTextareaRef = useRef(null);

    // UI 交互状态
    const [prompt, setPrompt] = useState(anchorNode.generation?.prompt ?? '');

    // 用 ref 实时追踪最新 prompt，避免闭包拿到旧值
    const promptRef = useRef(prompt);
    
    useEffect(() => {
        const nextPrompt = anchorNode.generation?.prompt ?? '';

        if (nextPrompt !== promptRef.current) {
            setPrompt(nextPrompt);
            promptRef.current = nextPrompt;

            // 强制 MentionTextarea 同步外部变更后的内容
            setPromptForceSyncKey((prev) => prev + 1);

            /*
            console.group('[AgentDebug] GenerationPanel prompt synced');
            console.log('nodeId:', anchorNode.id);
            console.log('nextPrompt:', nextPrompt);
            console.groupEnd();
            */
        }
    }, [
        anchorNode.id,
        anchorNode.generation?.prompt,
    ]);
    
    useEffect(() => {
        promptRef.current = prompt;
    }, [prompt]);

    // 用 ref 追踪最新 generation，避免 updateNodeData 后闭包仍使用旧数据
    const generationRef = useRef(anchorNode.generation || {});

    useEffect(() => {
        generationRef.current = anchorNode.generation || {};
    }, [anchorNode.generation]);

    // 接收从 PictureTags 传来的点击资产事件，命令输入框插入它
    const handleInsertMedia = useCallback((media) => {
        mentionTextareaRef.current?.insertMention?.(media);
    }, []);

    // 判断媒体基础类型
    const getReferenceBaseType = useCallback((media) => {
        if (!media?.type) return 'image';

        if (VIDEO_TYPES.includes(media.type) || media.type.includes('video')) {
            return 'video';
        }

        if (AUDIO_TYPES.includes(media.type) || media.type.includes('audio')) {
            return 'audio';
        }

        return 'image';
    }, []);

    // 将当前引用资产序列化为后端真正需要的数据
    // 注意：顺序必须来自 inputMedia / inputMediaRef.current，不能来自 incomingNodes 原始顺序
    const formatReferenceInputs = useCallback((mediaList) => {
        return mediaList
            .map(n => ({
                id: n.id,
                url: n.src,
                type: getReferenceBaseType(n),
            }))
            .filter(media => Boolean(media.url));
    }, [getReferenceBaseType]);

    // 根据媒体列表计算每个资产当前显示标签：
    // 图片：图1 / 图2
    // 视频：视1 / 视2
    // 音频：音1 / 音2
    const getMediaLabelMap = useCallback((mediaList) => {
        let imgCount = 0;
        let vidCount = 0;
        let audCount = 0;

        const map = {};

        mediaList.forEach((media) => {
            let label = '';

            if (VIDEO_TYPES.includes(media.type) || media.type?.includes('video')) {
                vidCount += 1;
                label = `视${vidCount}`;
            } else if (AUDIO_TYPES.includes(media.type) || media.type?.includes('audio')) {
                audCount += 1;
                label = `音${audCount}`;
            } else {
                imgCount += 1;
                label = `图${imgCount}`;
            }

            map[media.id] = label;
        });

        return map;
    }, []);

    // 拖拽排序后，重新映射 prompt 中的 @图N / @视N / @音N
    // 目标：资产语义不变，只改变显示编号
    const remapPromptByMediaOrder = useCallback((oldPrompt, oldMediaList, newMediaList) => {
        if (!oldPrompt) return oldPrompt;

        const oldLabelMap = getMediaLabelMap(oldMediaList);
        const newLabelMap = getMediaLabelMap(newMediaList);

        const labelRemap = {};

        oldMediaList.forEach((media) => {
            const oldLabel = oldLabelMap[media.id];
            const newLabel = newLabelMap[media.id];

            if (oldLabel && newLabel) {
                labelRemap[oldLabel] = newLabel;
            }
        });

        return oldPrompt.replace(/@([图视音]\d+)/g, (match, oldLabel) => {
            const newLabel = labelRemap[oldLabel];
            return newLabel ? `@${newLabel}` : match;
        });
    }, [getMediaLabelMap]);

    // 删除资产后，重新映射 prompt 中的 @图N / @视N / @音N
    // 目标：
    // 1. 被删除资产对应的 @图N 不能继续保留，否则会误绑定到后续资产
    // 2. 仍然存在的资产要根据新编号继续保持语义
    const remapPromptAfterDelete = useCallback((oldPrompt, oldMediaList, newMediaList, deletedId) => {
        if (!oldPrompt) return oldPrompt;

        const oldLabelMap = getMediaLabelMap(oldMediaList);
        const newLabelMap = getMediaLabelMap(newMediaList);

        const labelRemap = {};
        const deletedLabels = new Set();

        oldMediaList.forEach((media) => {
            const oldLabel = oldLabelMap[media.id];

            if (!oldLabel) return;

            if (media.id === deletedId) {
                deletedLabels.add(oldLabel);
                return;
            }

            const newLabel = newLabelMap[media.id];

            if (newLabel) {
                labelRemap[oldLabel] = newLabel;
            }
        });

        return oldPrompt.replace(/@([图视音]\d+)/g, (match, oldLabel) => {
            if (deletedLabels.has(oldLabel)) {
                return ``;
            }

            const newLabel = labelRemap[oldLabel];

            return newLabel ? `@${newLabel}` : match;
        });
    }, [getMediaLabelMap]);

    // 统一写回引用资产数据
    // 这里不依赖 syncToNode，避免旧 generation 覆盖最新引用顺序
    const persistReferenceInputs = useCallback((mediaList, extraGeneration = {}) => {
        const referenceNodeIds = mediaList.map(n => n.id);
        const inputs = formatReferenceInputs(mediaList);

        const nextGeneration = {
            ...(generationRef.current || {}),
            prompt: promptRef.current,
            inputs,
            referenceNodeIds,
            ...extraGeneration,
        };

        updateNodeData(anchorNode.id, {
            generation: nextGeneration,
        });

        generationRef.current = nextGeneration;
    }, [
        anchorNode.id,
        formatReferenceInputs,
        updateNodeData
    ]);

    // ✅ 初始化 / 合并外部连线与本地顺序
    // 关键：
    // 1. 重新打开 panel 时，优先使用 generation.referenceNodeIds 恢复用户排序
    // 2. 新连进来的资产追加到末尾
    // 3. 已断开的资产自动移除
    useEffect(() => {
        const currentValidNodes = incomingNodes.filter(n =>
            ALL_REFERENCE_TYPES.includes(n.type)
        );

        const currentIds = currentValidNodes.map(n => n.id);

        const savedReferenceNodeIds = Array.isArray(anchorNode.generation?.referenceNodeIds)
            ? anchorNode.generation.referenceNodeIds
            : [];

        setMediaOrderIds(prev => {
            const hasLocalOrder = prev.length > 0;

            const baseOrder = hasLocalOrder
                ? prev
                : savedReferenceNodeIds;

            const existingOrdered = baseOrder.filter(id =>
                currentIds.includes(id) && !deletedMediaIds.has(id)
            );

            const newIds = currentIds.filter(id =>
                !existingOrdered.includes(id) && !deletedMediaIds.has(id)
            );

            const nextOrder = [...existingOrdered, ...newIds];

            const prevSignature = prev.join('|');
            const nextSignature = nextOrder.join('|');

            if (prevSignature === nextSignature) {
                return prev;
            }

            return nextOrder;
        });
    }, [
        incomingNodes,
        deletedMediaIds,
        anchorNode.generation?.referenceNodeIds
    ]);

    // ✅ 最终用于传递的媒体列表，基于本地排序后的 IDs
    const inputMedia = useMemo(() => {
        return mediaOrderIds
            .map(id => incomingNodes.find(n => n.id === id))
            .filter(Boolean);
    }, [mediaOrderIds, incomingNodes]);

    // 用 ref 保存最新 inputMedia，解决拖拽连续触发时闭包滞后的问题
    const inputMediaRef = useRef(inputMedia);

    useEffect(() => {
        inputMediaRef.current = inputMedia;
    }, [inputMedia]);

    const hasMediaInput = useMemo(() => {
        return inputMedia.some(n =>
            VIDEO_TYPES.includes(n.type) ||
            AUDIO_TYPES.includes(n.type) ||
            n.type?.includes('video') ||
            n.type?.includes('audio')
        );
    }, [inputMedia]);

    const inputPicturesCount = useMemo(() => {
        return inputMedia.filter(n =>
            IMAGE_TYPES.includes(n.type)
        ).length;
    }, [inputMedia]);

    // 状态中心：只管理模型、比例、时长、风格等参数
    // 注意：syncToNode 不再负责引用资产顺序
    const { params, updateParam, config } = useGenerationParams(
        anchorNode,
        mode,
        updateNodeData,
        inputPicturesCount,
        hasMediaInput
    );

    // ✅ 排序回调
    // PictureTags 已改为拖拽结束后才调用 onReorder，所以这里正常只执行一次。
    const handleReorder = useCallback((newList) => {
        const oldInputMedia = inputMediaRef.current;

        const prevSignature = oldInputMedia.map(m => m.id).join('|');
        const nextSignature = newList.map(m => m.id).join('|');

        // 顺序没有变化，不做 prompt 重映射、不写节点、不刷新 TipTap
        if (prevSignature === nextSignature) {
            return;
        }

        const newInputMedia = newList;

        const nextPrompt = remapPromptByMediaOrder(
            promptRef.current,
            oldInputMedia,
            newInputMedia
        );

        const nextIds = newInputMedia.map(m => m.id);

        inputMediaRef.current = newInputMedia;
        promptRef.current = nextPrompt;

        setMediaOrderIds(nextIds);
        setPrompt(nextPrompt);

        // 强制 MentionTextarea 刷新 TipTap 内容
        setPromptForceSyncKey(prev => prev + 1);

        persistReferenceInputs(newInputMedia, {
            prompt: nextPrompt,
            referenceNodeIds: nextIds,
            inputs: formatReferenceInputs(newInputMedia),
        });
    }, [
        formatReferenceInputs,
        persistReferenceInputs,
        remapPromptByMediaOrder
    ]);

    // ✅ 删除回调
    // 删除中间资产时，后面的图N会前移，所以 prompt 必须重映射。
    // 被删除资产对应的 @图N 要替换成【已删除引用：图N】，避免误绑定到新的图N。
    const handleDeleteMedia = useCallback((id) => {
        const oldInputMedia = inputMediaRef.current;
        const nextInputMedia = oldInputMedia.filter(media => media.id !== id);

        const nextPrompt = remapPromptAfterDelete(
            promptRef.current,
            oldInputMedia,
            nextInputMedia,
            id
        );

        const nextIds = nextInputMedia.map(media => media.id);

        inputMediaRef.current = nextInputMedia;
        promptRef.current = nextPrompt;

        setDeletedMediaIds(prev => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });

        setMediaOrderIds(nextIds);
        setPrompt(nextPrompt);

        // 删除后编号关系也变了，必须强制刷新 TipTap
        setPromptForceSyncKey(prev => prev + 1);

        persistReferenceInputs(nextInputMedia, {
            prompt: nextPrompt,
            inputs: formatReferenceInputs(nextInputMedia),
            referenceNodeIds: nextIds,
        });

        if (typeof onRemoveConnection === 'function') {
            onRemoveConnection(id, anchorNode.id);
        }
    }, [
        anchorNode.id,
        formatReferenceInputs,
        onRemoveConnection,
        persistReferenceInputs,
        remapPromptAfterDelete
    ]);

    // 外部新增 / 移除连线后，把当前引用资产列表同步进节点数据层
    const lastPersistedReferenceSignatureRef = useRef('');

    useEffect(() => {
        const signature = inputMedia
            .map(n => `${n.id}:${n.type}:${n.src}`)
            .join('|');

        if (signature === lastPersistedReferenceSignatureRef.current) {
            return;
        }

        lastPersistedReferenceSignatureRef.current = signature;

        persistReferenceInputs(inputMedia);
    }, [
        inputMedia,
        persistReferenceInputs
    ]);

    // 参数更新
    const handleUpdateParam = useCallback((key, val) => {
        updateParam(key, val);

        // 修改比例时，同步画布物理尺寸
        if (key === 'aspectRatio' && val !== 'auto' && val !== 'free') {
            const newSize = getDimensionsByRatio(val, 360);

            const latestInputMedia = inputMediaRef.current;
            const inputs = formatReferenceInputs(latestInputMedia);
            const referenceNodeIds = latestInputMedia.map(n => n.id);

            const nextGeneration = {
                ...(generationRef.current || {}),
                prompt: promptRef.current,
                inputs,
                referenceNodeIds,
                aspectRatio: val,
            };

            updateNodeData(anchorNode.id, {
                size: newSize,
                generation: nextGeneration,
            });

            generationRef.current = nextGeneration;
        }
    }, [
        anchorNode.id,
        formatReferenceInputs,
        updateNodeData,
        updateParam
    ]);

    // 面板关闭时，把最新 prompt 和引用资产顺序一起保存进节点
    // 不再使用 syncToNode，避免旧 generation 覆盖引用顺序
    useEffect(() => {
        return () => {
            const latestInputMedia = inputMediaRef.current;
            const inputs = formatReferenceInputs(latestInputMedia);
            const referenceNodeIds = latestInputMedia.map(n => n.id);

            const nextGeneration = {
                ...(generationRef.current || {}),
                prompt: promptRef.current,
                inputs,
                referenceNodeIds,
            };

            updateNodeData(anchorNode.id, {
                generation: nextGeneration,
            });

            generationRef.current = nextGeneration;
        };
    }, [
        anchorNode.id,
        formatReferenceInputs,
        updateNodeData
    ]);

    const [activePopover, setActivePopover] = useState(null);
    const popoverRef = useRef(null);

    // 发送逻辑
    // 关键：点击生成时，不再调用 syncToNode 保存引用资产。
    // 引用资产顺序只相信 inputMediaRef.current。
    const handleSend = useCallback(() => {
        const latestPrompt = promptRef.current;

        if (!latestPrompt && mode !== 'video') return;

        setActivePopover(null);

        const latestInputMedia = inputMediaRef.current;

        const formattedInputs = formatReferenceInputs(latestInputMedia);
        const referenceNodeIds = latestInputMedia.map(n => n.id);

        const typeMap = {
            图: '图',
            视: '视频',
            音: '音频',
        };

        const cleanPrompt = latestPrompt.replace(/@([图视音])(\d+)/g, (_, type, num) => {
            return `${typeMap[type]}${num}`;
        });

        const finalPrompt = mode === 'image'
            ? buildPresetPrompt(cleanPrompt, params.gridMode, params.imageStyle)
            : cleanPrompt;

        const nextGeneration = {
            ...(generationRef.current || {}),

            // 参数
            ...params,

            // prompt
            prompt: latestPrompt,
            rawPrompt: latestPrompt,
            finalPrompt,

            // 模型
            model: mode === 'image'
                ? params.imageModel
                : params.videoModel,

            apiMode: mode === 'video'
                ? params.videoRefMode
                : 'imageRefMode',

            // 最重要：使用最新顺序
            inputs: formattedInputs,
            referenceNodeIds,
        };

        updateNodeData(anchorNode.id, {
            generation: nextGeneration,
        });

        // 立刻刷新 ref，防止关闭 panel 时旧数据再次覆盖
        generationRef.current = nextGeneration;

        onGenerate({
            ...params,
            prompt: finalPrompt,
            rawPrompt: latestPrompt,
            model: mode === 'image'
                ? params.imageModel
                : params.videoModel,
            nodeId: anchorNode.id,
            apiMode: mode === 'video'
                ? params.videoRefMode
                : 'imageRefMode',
            inputs: formattedInputs,
            referenceNodeIds,
        });
    }, [
        anchorNode.id,
        formatReferenceInputs,
        mode,
        onGenerate,
        params,
        updateNodeData
    ]);

    // 全局点击外部关闭弹窗
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                setActivePopover(null);
            }
        };

        if (activePopover) {
            document.addEventListener('pointerdown', handleClickOutside, true);
        }

        return () => {
            document.removeEventListener('pointerdown', handleClickOutside, true);
        };
    }, [activePopover]);

    const stopInteraction = (e) => e.stopPropagation();

    return (
        <div
            data-panel-for={anchorNode.id}
            className="no-wheel no-drag absolute top-0 left-0 w-[520px] bg-[#212121] rounded-3xl shadow-[0_24px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 flex flex-col z-[100] p-4 pointer-events-auto"
            style={panelStyle}
            onPointerDown={stopInteraction}
            onWheel={stopInteraction}
        >
            {/* 顶部视频模式切换 Tabs */}
            {mode === 'video' && (
                <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar">
                    {VIDEO_REFERENCE_MODES.map(m => {
                        const isFirstLast = m.value === 'first_last';

                        // 含媒体或图片 ≥ 3 张时，禁用首尾帧
                        const isDisabled = isFirstLast && (
                            inputMedia.length >= 3 || hasMediaInput
                        );

                        const isActive = params.videoRefMode === m.value;

                        return (
                            <button
                                key={m.value}
                                disabled={isDisabled}
                                onClick={() => handleUpdateParam('videoRefMode', m.value)}
                                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[13px] font-medium transition-all border ${
                                    isActive
                                        ? 'bg-[#333] text-white border-neutral-500 shadow-sm'
                                        : 'bg-transparent text-neutral-400 border-white/5 hover:bg-[#2a2a2a] hover:text-neutral-200'
                                } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                {m.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 顶栏：输入媒体引用标签 */}
            {inputMedia.length > 0 && (
                <PictureTags
                    pictures={inputMedia}
                    mode={mode}
                    videoRefMode={params.videoRefMode}
                    onReorder={handleReorder}
                    onDelete={handleDeleteMedia}
                    onInsert={handleInsertMedia}
                />
            )}

            {/* 中间：自适应高阶输入框，@ 联想引擎 */}
            <MentionTextarea
                ref={mentionTextareaRef}
                prompt={prompt}
                setPrompt={setPrompt}
                mode={mode}
                inputMedia={inputMedia}
                onSend={handleSend}
                forceSyncKey={promptForceSyncKey}
            />

            {/* 底栏：模型与参数控制条 */}
            <div ref={popoverRef} className="relative">
                <ControlToolbar
                    mode={mode}
                    params={params}
                    config={config}
                    updateParam={handleUpdateParam}
                    activePopover={activePopover}
                    setActivePopover={setActivePopover}
                    onSend={handleSend}
                    isLoading={anchorNode._isLoading}
                    isPromptEmpty={!prompt}
                    inputPictureCount={inputPicturesCount}
                    hasMediaInput={hasMediaInput}
                />
            </div>
        </div>
    );
}
