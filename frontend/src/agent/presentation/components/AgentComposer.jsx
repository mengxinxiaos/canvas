import React, { useEffect, useRef } from 'react';
import {
    Loader2,
    Plus,
    Send,
    X,
    Image as ImageIcon,
} from 'lucide-react';

import AgentComposerActionMenu from './AgentComposerActionMenu';
import AgentSkillPicker from './AgentSkillPicker';
import AgentModelSelect from './AgentModelSelect';
import { useAgentComposerSkillPicker } from '../hooks/useAgentComposerSkillPicker';
import { agentUi } from './agentUiClassNames';

function AgentAttachmentPreviewList({
    attachments = [],
    onRemoveAttachment,
}) {
    if (!attachments?.length) return null;

    return (
        <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar">
            {attachments.map((item, index) => {
                const key = item.id || item.nodeId || item.url || index;

                return (
                    <div
                        key={key}
                        className="relative w-14 h-14 rounded-xl overflow-hidden border border-neutral-700 bg-neutral-900 shrink-0 group"
                        title={item.name || item.nodeId || '图片引用'}
                    >
                        {item.url ? (
                            <img
                                src={item.url}
                                alt=""
                                draggable={false}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-neutral-500">
                                <ImageIcon size={18} />
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onRemoveAttachment?.(item);
                            }}
                            className="absolute right-1 top-1 w-4 h-4 rounded-full bg-black/75 text-white text-[10px] flex items-center justify-center opacity-90 hover:opacity-100 hover:bg-red-500 transition-colors"
                            title="移除引用"
                        >
                            ×
                        </button>

                        {item.source === 'canvas' && (
                            <div className="absolute left-1 bottom-1 px-1 py-0.5 rounded bg-black/65 text-[9px] text-neutral-200 leading-none">
                                画布
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function AgentComposer({
    value,
    onChange,
    onSend,
    disabled,

    availableSkills,
    selectedSkillNames,
    onAddSkillName,
    onRemoveSkillName,
    onToggleSkillName,
    isLoadingSkills,
    skillsError,
    onRefreshSkills,

    agentModelSelector,

    attachments = [],
    onRemoveAttachment,
    onStartPickCanvasImages,
    onStopPickCanvasImages,
    isPickingCanvasImages = false,
}) {
    const textareaRef = useRef(null);
    const {
        isActionMenuOpen,
        skillPickerMode,
        slashQuery,

        closeMenus,
        openActionMenu,
        openSkillsFromMenu,
        updateSlashState,
        handleChange,
        pickSkill,

        setIsActionMenuOpen,
        setSkillPickerMode,
    } = useAgentComposerSkillPicker({
        value,
        onChange,
        textareaRef,

        onAddSkillName,
        onToggleSkillName,
        onRefreshSkills,
    });
    const normalizedAttachments = Array.isArray(attachments)
        ? attachments
        : [];

    const hasText = Boolean(String(value || '').trim());
    const hasAttachments = normalizedAttachments.length > 0;
    const canSend = hasText || hasAttachments;

    const handleKeyDown = (e) => {
        e.stopPropagation();

        if (e.key === '/') {
            requestAnimationFrame(updateSlashState);
            return;
        }

        if (skillPickerMode) {
            if (
                e.key === 'ArrowDown' ||
                e.key === 'ArrowUp' ||
                e.key === 'Enter' ||
                e.key === 'Escape'
            ) {
                e.preventDefault();
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();

            if (disabled) return;
            if (!canSend) return;

            onSend?.();
        }

        if (e.key === 'Escape') {
            closeMenus();
        }
    };

    const stopKeyboardBubble = (e) => {
        e.stopPropagation();
    };

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;

        el.style.height = '0px';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [value]);

    return (
        <div
            className={agentUi.composer}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
        >
            <AgentComposerActionMenu
                open={isActionMenuOpen}
                onClose={() => setIsActionMenuOpen(false)}
                onOpenSkills={openSkillsFromMenu}
                onPickFromCanvas={() => {
                    closeMenus();
                    onStartPickCanvasImages?.();
                }}
            />

            <AgentSkillPicker
                open={Boolean(skillPickerMode)}
                mode={skillPickerMode || 'menu'}
                skills={availableSkills || []}
                query={slashQuery}
                selectedSkillNames={selectedSkillNames || []}
                isLoading={isLoadingSkills}
                error={skillsError}
                onClose={() => setSkillPickerMode(null)}
                onPickSkill={pickSkill}
                onRemoveSkill={onRemoveSkillName}
            />

            {isPickingCanvasImages && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-blue-400/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
                    <div className="min-w-0">
                        <div className="font-semibold text-blue-100">
                            从画布添加
                        </div>
                        <div className="text-[11px] text-blue-200/75 truncate">
                            点击画布中的图片节点，将其作为本轮 Agent 图片引用。
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onStopPickCanvasImages?.();
                        }}
                        className="shrink-0 rounded-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-300/20 px-2 py-1 text-[11px] text-blue-100"
                    >
                        退出
                    </button>
                </div>
            )}

            {selectedSkillNames?.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {selectedSkillNames.map((name) => (
                        <button
                            key={name}
                            type="button"
                            onClick={() => onRemoveSkillName?.(name)}
                            className={agentUi.chip}
                            title="移除技能"
                        >
                            {name}
                            <X size={11} />
                        </button>
                    ))}
                </div>
            )}

            <AgentAttachmentPreviewList
                attachments={normalizedAttachments}
                onRemoveAttachment={onRemoveAttachment}
            />

            <div className={agentUi.composerBox}>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onKeyUp={stopKeyboardBubble}
                    onKeyPress={stopKeyboardBubble}
                    onBeforeInput={stopKeyboardBubble}
                    onClick={() => {
                        requestAnimationFrame(updateSlashState);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                    disabled={disabled}
                    rows={1}
                    placeholder={
                        hasAttachments
                            ? '描述你想让 Agent 分析图片的内容，也可以直接发送'
                            : '描述创意或需求，输入 / 使用技能'
                    }
                    className={agentUi.textarea}
                />

                <div className={agentUi.composerToolbar}>
                    <div className={agentUi.composerToolbarLeft}>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                openActionMenu();
                            }}
                            disabled={disabled}
                            className={agentUi.composerAddButton}
                            title="添加能力"
                        >
                            <Plus size={17} />
                        </button>

                        <AgentModelSelect
                            models={agentModelSelector?.models || []}
                            selectedModelId={agentModelSelector?.selectedModelId}
                            onChange={agentModelSelector?.setSelectedModelId}
                            disabled={disabled}
                        />
                    </div>

                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            if (disabled) return;
                            if (!canSend) return;

                            onSend?.();
                        }}
                        disabled={disabled || !canSend}
                        className={agentUi.sendButton}
                        title="发送"
                        type="button"
                    >
                        {disabled ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Send size={16} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}