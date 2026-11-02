import React, { useRef } from 'react';
import { useDismissablePopover } from '../../../hooks/ui/useDismissablePopover';
import {
    Sparkles,
    ImagePlus,
    Paperclip,
    Quote,
    Wrench,
} from 'lucide-react';

import { agentUi, cx } from './agentUiClassNames';

const ACTIONS = [
    {
        id: 'pick-canvas-image',
        title: '从画布添加',
        description: '点击画布图片节点作为引用',
        icon: Quote,
        enabled: true,
    },
    {
        id: 'skills',
        title: '技能',
        description: '选择一个或多个 Agent Skill',
        icon: Sparkles,
        enabled: true,
    },
    {
        id: 'upload',
        title: '上传',
        description: '稍后支持上传文件或参考图',
        icon: Paperclip,
        enabled: false,
    },
   
];

export default function AgentComposerActionMenu({
    open,
    onClose,
    onOpenSkills,
    onPickFromCanvas,
}) {
    const rootRef = useRef(null);

    useDismissablePopover({
        open,
        rootRef,
        onClose,
    });

    if (!open) return null;

    const handleAction = (action) => {
        if (!action.enabled) return;

        if (action.id === 'skills') {
            onOpenSkills?.();
        }
        if (action.id === 'pick-canvas-image') {
            onPickFromCanvas?.();
            onClose?.();
        }
    };

    return (
        <div
            ref={rootRef}
            className={agentUi.popoverNarrow}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
        >
            <div className={agentUi.menuSectionLabel}>
                添加能力
            </div>

            <div className="p-2 space-y-1 bg-[#202020]">
                {ACTIONS.map((action) => {
                    const Icon = action.icon;

                    return (
                        <button
                            key={action.id}
                            type="button"
                            disabled={!action.enabled}
                            onClick={() => handleAction(action)}
                            className={cx(
                                agentUi.menuItem,
                                !action.enabled && agentUi.menuItemDisabled,
                            )}
                        >
                            <div className={agentUi.iconBox}>
                                <Icon size={16} />
                            </div>

                            <div className="min-w-0">
                                <div className="text-sm font-medium">
                                    {action.title}
                                </div>

                                <div className="text-[11px] text-neutral-500 truncate">
                                    {action.description}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className={cx(agentUi.popoverFooter, 'flex justify-end')}>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs text-neutral-500 hover:text-neutral-200"
                >
                    关闭
                </button>
            </div>
        </div>
    );
}