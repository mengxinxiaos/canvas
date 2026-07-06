// frontend/src/components/agent/AgentModelSelect.jsx

import React, { useCallback, useMemo, useRef, useState } from 'react';
import AgentOptionItem from './AgentOptionItem';
import { useKeyboardListNavigation } from '../../../hooks/ui/useKeyboardListNavigation';
import { useDismissablePopover } from '../../../hooks/ui/useDismissablePopover';
import {
    Bot,
    BrainCircuit,
    Check,
    ChevronDown,
    X,
} from 'lucide-react';

import { agentUi, cx } from './agentUiClassNames';

function getModelIcon(model) {
    if (model?.capabilities?.reasoning) {
        return BrainCircuit;
    }

    return Bot;
}

export default function AgentModelSelect({
    models,
    selectedModelId,
    onChange,
    disabled,
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    const selectedModel = useMemo(() => {
        return (
            (models || []).find((model) => model.id === selectedModelId) ||
            (models || [])[0] ||
            null
        );
    }, [models, selectedModelId]);
    const modelList = models || [];

    const selectedIndex = Math.max(
        0,
        modelList.findIndex((model) => model.id === selectedModel?.id),
    );

    const closePopover = useCallback(() => {
        setOpen(false);
    }, []);

    const pickModelByIndex = useCallback((index) => {
        const model = modelList[index];

        if (!model) return;

        onChange?.(model.id);
        setOpen(false);
    }, [
        modelList,
        onChange,
    ]);

    const {
        activeIndex,
        setActiveIndex,
    } = useKeyboardListNavigation({
        open,
        itemCount: modelList.length,
        onPickIndex: pickModelByIndex,
        resetKey: selectedModel?.id,
        initialIndex: selectedIndex,
    });

    useDismissablePopover({
        open,
        rootRef,
        onClose: closePopover,
    });
    
    if (!selectedModel) return null;

    const SelectedIcon = getModelIcon(selectedModel);

    return (
        <div
            ref={rootRef}
            className={agentUi.modelSelectRoot}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
        >
            <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen((value) => !value);
                }}
                className={cx(
                    agentUi.modelSelectButton,
                    open && agentUi.modelSelectButtonActive,
                )}
                title={`当前模型：${selectedModel.shortLabel}`}
            >
                <SelectedIcon size={14} className="shrink-0" />
                <span className={agentUi.modelSelectLabel}>
                    {selectedModel.shortLabel || selectedModel.label}
                </span>
                <ChevronDown
                    size={13}
                    className={cx(
                        'shrink-0 transition-transform',
                        open && 'rotate-180',
                    )}
                />
            </button>

            {open && (
                <div className={agentUi.modelSelectPopover}>
                    <div className={agentUi.modelSelectHeader}>
                        <div>
                            <div className="text-sm font-semibold text-neutral-100">
                                选择 Agent 模型
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                                影响后续 Agent 回复与工具接力
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-[#2b2b2b]"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="p-2 bg-[#202020] space-y-1">
                        {modelList.map((model, index) => {
                            const selected = model.id === selectedModel.id;
                            const active = index === activeIndex;
                            const Icon = getModelIcon(model);

                            return (
                                <AgentOptionItem
                                    className="py-3"
                                    key={model.id}
                                    icon={Icon}
                                    title={model.shortLabel || model.label}
                                    subtitle={model.description || '暂无描述'}
                                    meta={model.provider}
                                    active={active}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => {
                                        onChange?.(model.id);
                                        setOpen(false);
                                    }}
                                    rightSlot={
                                        selected ? (
                                            <div className={agentUi.chipSelected}>
                                                <Check size={13} />
                                            </div>
                                        ) : null
                                    }
                                >
                                    <div className="flex items-center gap-1.5 mt-2">
                                        {model.capabilities?.tools && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-400/15">
                                                Tools
                                            </span>
                                        )}

                                        {model.capabilities?.reasoning && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-400/15">
                                                Reasoning
                                            </span>
                                        )}

                                        {model.capabilities?.multiModal && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-400/15">
                                                MultiModal
                                            </span>
                                        )}
                                    </div>
                                </AgentOptionItem>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}