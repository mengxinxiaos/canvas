import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Check,
    Loader2,
    Search,
    Sparkles,
    X,
} from 'lucide-react';

import { agentUi, cx } from './agentUiClassNames';
import { useDismissablePopover } from '../../../hooks/ui/useDismissablePopover';
import { useKeyboardListNavigation } from '../../../hooks/ui/useKeyboardListNavigation';
import AgentOptionItem from './AgentOptionItem';

function filterSkills(skills, query) {
    const q = String(query || '').trim().toLowerCase();

    if (!q) return skills || [];

    return (skills || []).filter((skill) => {
        const name = String(skill.name || '').toLowerCase();
        const title = String(skill.title || '').toLowerCase();
        const desc = String(skill.description || skill.preview || '').toLowerCase();

        return (
            name.includes(q) ||
            title.includes(q) ||
            desc.includes(q)
        );
    });
}

export default function AgentSkillPicker({
    open,
    mode = 'menu',
    skills,
    query,
    selectedSkillNames,
    isLoading,
    error,
    onClose,
    onPickSkill,
    onRemoveSkill,
}) {
    const [localQuery, setLocalQuery] = useState('');
    const rootRef = useRef(null);
    const searchRef = useRef(null);

    const effectiveQuery = mode === 'slash' ? query : localQuery;

    const filteredSkills = useMemo(() => {
        return filterSkills(skills, effectiveQuery);
    }, [skills, effectiveQuery]);

    const handlePickActiveIndex = useCallback((index) => {
        const skill = filteredSkills[index] || filteredSkills[0];
        if (skill) {
            onPickSkill?.(skill);
        }
    }, [
        filteredSkills,
        onPickSkill,
    ]);

    const {
        activeIndex,
        setActiveIndex,
    } = useKeyboardListNavigation({
        open,
        itemCount: filteredSkills.length,
        onPickIndex: handlePickActiveIndex,
        resetKey: effectiveQuery,
    });

    useDismissablePopover({
        open,
        rootRef,
        onClose,
        closeOnEscape: true,
        closeOnOutsidePointerDown: mode === 'menu',
    });

    useEffect(() => {
        if (!open) return;

        if (mode === 'menu') {
            requestAnimationFrame(() => {
                searchRef.current?.focus();
            });
        }
    }, [
        open,
        mode,
    ]);

    

    if (!open) return null;

    const selectedSet = new Set(selectedSkillNames || []);

    return (
        <div
            ref={rootRef}
            className={agentUi.popoverWide}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
        >
            <div className={agentUi.popoverHeader}>
                <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
                        <Sparkles size={15} className="text-blue-300" />
                        技能
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-[#2b2b2b]"
                    >
                        <X size={14} />
                    </button>
                </div>

                {mode === 'menu' && (
                    <div className={agentUi.searchInputWrap}>
                        <Search size={14} className="text-neutral-500" />

                        <input
                            ref={searchRef}
                            value={localQuery}
                            onChange={(e) => setLocalQuery(e.target.value)}
                            placeholder="搜索技能"
                            className={agentUi.searchInput}
                        />
                    </div>
                )}

                {mode === 'slash' && (
                    <div className="text-xs text-neutral-500">
                        输入 / 唤出技能，Enter 选择，Esc 关闭
                    </div>
                )}
            </div>

            <div className={agentUi.popoverScroll}>
                {isLoading && (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500">
                        <Loader2 size={15} className="animate-spin" />
                        正在加载技能...
                    </div>
                )}

                {!isLoading && error && (
                    <div className="px-3 py-6 text-sm text-red-300 text-center">
                        {error}
                    </div>
                )}

                {!isLoading && !error && filteredSkills.length === 0 && (
                    <div className="px-3 py-8 text-sm text-neutral-500 text-center">
                        没有匹配的技能
                    </div>
                )}

                {!isLoading && !error && filteredSkills.map((skill, index) => {
                    const selected = selectedSet.has(skill.name);
                    const active = index === activeIndex;

                    return (
                        <AgentOptionItem
                            key={skill.name}
                            icon={Sparkles}
                            title={skill.title || skill.name}
                            meta={skill.title && skill.title !== skill.name ? skill.name : ''}
                            subtitle={skill.description || skill.preview || '暂无描述'}
                            active={active}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => onPickSkill?.(skill)}
                            rightSlot={
                                selected ? (
                                    <div
                                        className={agentUi.chipSelected}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onRemoveSkill?.(skill.name);
                                        }}
                                        title="移除技能"
                                    >
                                        <Check size={13} />
                                    </div>
                                ) : null
                            }
                        />
                    );
                })}
            </div>

            {selectedSkillNames?.length > 0 && (
                <div className={cx(agentUi.popoverFooter, 'flex flex-wrap gap-1.5')}>
                    {selectedSkillNames.map((name) => (
                        <button
                            key={name}
                            type="button"
                            onClick={() => onRemoveSkill?.(name)}
                            className={agentUi.chip}
                        >
                            {name}
                            <X size={11} />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}