import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useGenerationParams } from './hooks/useGenerationParams';
import { buildPresetPrompt } from '../../../utils/promptBuilder';
import { getDimensionsByRatio } from '../../../utils/helpers';
import {
    getReferenceType, reconcileReferenceOrder, serializeReferenceMedia,
    remapReferencePrompt, getReferenceSignature, restoreReferenceMedia, getReferenceValidationError,
} from '../../../utils/referenceMedia';
import MentionTextarea from './components/MentionTextarea';
import ControlToolbar from './components/ControlToolbar';
import PictureTags from './components/PictureTags';
import PanelFrame from './components/PanelFrame';
import { VIDEO_REFERENCE_MODES, getAvailableModelsByMode } from '../../../config/constants';

export default function GenerationPanel({
    mode, anchorNode, incomingNodes, viewport, onGenerate, updateNodeData, onRemoveConnection,
}) {
    const mentionTextareaRef = useRef(null);
    const [prompt, setPrompt] = useState(anchorNode.generation?.prompt ?? '');
    const promptRef = useRef(prompt);
    const observedPromptRef = useRef(anchorNode.generation?.prompt ?? '');
    const lastWrittenPromptRef = useRef(null);
    const [promptForceSyncKey, setPromptForceSyncKey] = useState(0);
    const [activePopover, setActivePopover] = useState(null);

    // All writers send patches. An old generation snapshot must never overwrite
    // parameters, references or text written by another interaction.
    const persistGeneration = useCallback((patch = {}) => {
        const generation = { prompt: promptRef.current, ...patch };
        lastWrittenPromptRef.current = generation.prompt;
        updateNodeData(anchorNode.id, { generation });
    }, [anchorNode.id, updateNodeData]);

    const handlePromptChange = useCallback((value) => {
        const next = typeof value === 'function' ? value(promptRef.current) : value;
        promptRef.current = next;
        setPrompt(next);
    }, []);

    // Debounce typing writes; closing still flushes the latest prompt.
    useEffect(() => {
        const timer = window.setTimeout(() => persistGeneration(), 400);
        return () => window.clearTimeout(timer);
    }, [prompt, persistGeneration]);
    useEffect(() => () => persistGeneration(), [persistGeneration]);

    const inputMedia = useMemo(() => reconcileReferenceOrder(
        incomingNodes, anchorNode.generation?.referenceNodeIds,
    ), [incomingNodes, anchorNode.generation?.referenceNodeIds]);
    const inputMediaRef = useRef(restoreReferenceMedia(anchorNode.generation, inputMedia));
    const lastReferenceSignatureRef = useRef(null);

    // UI reorder/delete and external edge changes share the same ID remapping.
    // Disconnected assets have no permanent tombstone, so reconnecting works.
    const syncReferences = useCallback((nextMedia) => {
        const signature = getReferenceSignature(nextMedia);
        if (lastReferenceSignatureRef.current === signature) return;
        const nextPrompt = remapReferencePrompt(promptRef.current, inputMediaRef.current, nextMedia);
        inputMediaRef.current = nextMedia;
        lastReferenceSignatureRef.current = signature;
        if (nextPrompt !== promptRef.current) handlePromptChange(nextPrompt);
        setPromptForceSyncKey(key => key + 1);
        persistGeneration({
            prompt: nextPrompt,
            inputs: serializeReferenceMedia(nextMedia),
            referenceNodeIds: nextMedia.map(media => media.id),
        });
    }, [handlePromptChange, persistGeneration]);

    useLayoutEffect(() => {
        const savedPrompt = anchorNode.generation?.prompt ?? '';
        const changed = observedPromptRef.current !== savedPrompt;
        observedPromptRef.current = savedPrompt;
        // Receive an external prompt and its reference order as one snapshot.
        // Own save acknowledgements must not overwrite newer unsaved typing.
        if (changed && savedPrompt !== lastWrittenPromptRef.current && savedPrompt !== promptRef.current) {
            inputMediaRef.current = restoreReferenceMedia(anchorNode.generation, inputMedia);
            // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing an external document snapshot
            handlePromptChange(savedPrompt);
            setPromptForceSyncKey(key => key + 1);
        }
        syncReferences(inputMedia);
    }, [anchorNode.generation, inputMedia, syncReferences, handlePromptChange]);

    const inputPicturesCount = inputMedia.filter(media => getReferenceType(media) === 'image').length;
    const hasMediaInput = inputMedia.some(media => getReferenceType(media) !== 'image');
    const { params, updateParam, config, getParams } = useGenerationParams(
        anchorNode, mode, updateNodeData, inputPicturesCount, hasMediaInput, persistGeneration,
    );

    const handleUpdateParam = useCallback((key, value) => {
        const next = updateParam(key, value);
        if (key === 'aspectRatio' && next.aspectRatio !== 'auto' && next.aspectRatio !== 'free') {
            updateNodeData(anchorNode.id, { size: getDimensionsByRatio(next.aspectRatio, 360) });
        }
    }, [anchorNode.id, updateNodeData, updateParam]);

    const handleDeleteMedia = useCallback((id) => {
        syncReferences(inputMediaRef.current.filter(media => media.id !== id));
        onRemoveConnection?.(id, anchorNode.id);
    }, [anchorNode.id, onRemoveConnection, syncReferences]);

    const validationError = getReferenceValidationError(inputMedia, mode, config);

    const handleSend = useCallback(() => {
        if (anchorNode._isLoading || validationError) return;
        const latestPrompt = promptRef.current;
        if (!latestPrompt.trim() && mode !== 'video') return;
        setActivePopover(null);
        const latestMedia = inputMediaRef.current;
        const latestParams = getParams();
        const cleanPrompt = latestPrompt.replace(/@([图视音])(\d+)/g, (_, type, num) => (
            `${{ 图: '图', 视: '视频', 音: '音频' }[type]}${num}`
        ));
        const finalPrompt = mode === 'image'
            ? buildPresetPrompt(cleanPrompt, latestParams.gridMode, latestParams.imageStyle) : cleanPrompt;
        const generation = {
            ...latestParams,
            rawPrompt: latestPrompt,
            finalPrompt,
            model: mode === 'image' ? latestParams.imageModel : latestParams.videoModel,
            apiMode: mode === 'video' ? latestParams.videoRefMode : 'imageRefMode',
            inputs: serializeReferenceMedia(latestMedia),
            referenceNodeIds: latestMedia.map(media => media.id),
        };
        persistGeneration({ ...generation, prompt: latestPrompt });
        onGenerate({ ...generation, nodeId: anchorNode.id, prompt: finalPrompt });
    }, [anchorNode._isLoading, anchorNode.id, validationError, mode, getParams, persistGeneration, onGenerate]);

    return (
        <PanelFrame anchorNode={anchorNode} viewport={viewport} mode={mode} onPresentationChange={() => setActivePopover(null)}>
            {expanded => <>
            <div className={expanded
                ? 'flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-2 lg:grid-rows-1 gap-5'
                : 'min-h-0 overflow-y-auto overscroll-contain'}>
            <div className={expanded ? 'min-h-0 flex flex-col rounded-2xl border border-white/10 bg-black/10 p-4' : ''}>
            {mode === 'video' && (
                <div className="flex shrink-0 items-center gap-2 mb-4 overflow-x-auto">
                    {VIDEO_REFERENCE_MODES.map(referenceMode => {
                        const disabled = getAvailableModelsByMode('video', referenceMode.value).length === 0
                            || (referenceMode.value === 'first_last' && (inputPicturesCount >= 3 || hasMediaInput));
                        return (
                            <button
                                key={referenceMode.value}
                                type="button"
                                disabled={disabled}
                                title={disabled ? '当前模型或引用资产不支持此模式' : undefined}
                                onClick={() => handleUpdateParam('videoRefMode', referenceMode.value)}
                                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[13px] font-medium border transition-colors ${
                                    params.videoRefMode === referenceMode.value ? 'bg-[#333] text-white border-neutral-500'
                                        : 'text-neutral-400 border-white/5 hover:bg-[#2a2a2a]'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >{referenceMode.label}</button>
                        );
                    })}
                </div>
            )}
            <p className={expanded && !inputMedia.length ? 'text-sm text-neutral-500' : 'hidden'}>连接图片、视频或音频后，将在这里显示参考资产。</p>
            <PictureTags
                pictures={inputMedia}
                mode={mode}
                videoRefMode={params.videoRefMode}
                maxAssets={config.maxReferenceAssets}
                expanded={expanded}
                onReorder={syncReferences}
                onDelete={handleDeleteMedia}
                onInsert={media => mentionTextareaRef.current?.insertMention?.(media)}
            />
            </div>
            <div className={expanded ? 'min-h-0 flex flex-col rounded-2xl border border-white/10 bg-black/10 p-4' : ''}>
            <MentionTextarea
                ref={mentionTextareaRef}
                prompt={prompt}
                setPrompt={handlePromptChange}
                mode={mode}
                inputMedia={inputMedia}
                onSend={handleSend}
                forceSyncKey={promptForceSyncKey}
                expanded={expanded}
            />
            {validationError && <p role="alert" className="text-xs text-amber-400 mb-3">{validationError}</p>}
            </div>
            </div>
            <div className="relative shrink-0 pt-3">
                <ControlToolbar
                    mode={mode}
                    params={params}
                    config={config}
                    updateParam={handleUpdateParam}
                    activePopover={activePopover}
                    setActivePopover={setActivePopover}
                    onSend={handleSend}
                    isLoading={anchorNode._isLoading}
                    isPromptEmpty={!prompt.trim()}
                    isSendBlocked={Boolean(validationError)}
                />
            </div>
            </>}
        </PanelFrame>
    );
}
