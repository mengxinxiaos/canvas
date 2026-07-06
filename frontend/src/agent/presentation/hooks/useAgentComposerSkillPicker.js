

import { useCallback, useState } from 'react';
import {
    getActiveSlashTrigger,
    insertSkillMention,
} from '../../application/skills/useAgentSkillMentions';

export function useAgentComposerSkillPicker({
    value,
    onChange,
    textareaRef,

    onAddSkillName,
    onToggleSkillName,
    onRefreshSkills,
} = {}) {
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [skillPickerMode, setSkillPickerMode] = useState(null);
    const [slashQuery, setSlashQuery] = useState('');

    const closeMenus = useCallback(() => {
        setIsActionMenuOpen(false);
        setSkillPickerMode(null);
        setSlashQuery('');
    }, []);

    const openActionMenu = useCallback(() => {
        setIsActionMenuOpen((prev) => !prev);
        setSkillPickerMode(null);
        setSlashQuery('');
    }, []);

    const openSkillsFromMenu = useCallback(() => {
        setIsActionMenuOpen(false);
        setSkillPickerMode('menu');
        setSlashQuery('');
        onRefreshSkills?.();
    }, [onRefreshSkills]);

    const updateSlashState = useCallback(() => {
        const el = textareaRef?.current;
        if (!el) return;

        const trigger = getActiveSlashTrigger(value, el.selectionStart);

        if (!trigger) {
            setSkillPickerMode((prev) => {
                if (prev === 'slash') {
                    setSlashQuery('');
                    return null;
                }

                return prev;
            });

            return;
        }

        setSlashQuery(trigger.query || '');
        setSkillPickerMode('slash');
        setIsActionMenuOpen(false);
    }, [
        value,
        textareaRef,
    ]);

    const handleChange = useCallback((e) => {
        const nextValue = e.target.value;

        onChange?.(nextValue);

        requestAnimationFrame(() => {
            const el = textareaRef?.current;
            if (!el) return;

            const trigger = getActiveSlashTrigger(el.value, el.selectionStart);

            if (trigger) {
                setSlashQuery(trigger.query || '');
                setSkillPickerMode('slash');
                setIsActionMenuOpen(false);
                return;
            }

            setSkillPickerMode((prev) => {
                if (prev === 'slash') {
                    setSlashQuery('');
                    return null;
                }

                return prev;
            });
        });
    }, [
        onChange,
        textareaRef,
    ]);

    const pickSkill = useCallback((skill) => {
        if (!skill?.name) return;

        if (skillPickerMode === 'slash') {
            onAddSkillName?.(skill.name);

            const el = textareaRef?.current;
            const caret = el?.selectionStart ?? String(value || '').length;

            const { nextValue, nextCaret } = insertSkillMention(
                value,
                caret,
                skill.name,
            );

            onChange?.(nextValue);

            requestAnimationFrame(() => {
                const target = textareaRef?.current;
                if (!target) return;

                target.focus();
                target.setSelectionRange(nextCaret, nextCaret);
            });

            closeMenus();
            return;
        }

        onToggleSkillName?.(skill.name);
    }, [
        skillPickerMode,
        onAddSkillName,
        onToggleSkillName,
        textareaRef,
        value,
        onChange,
        closeMenus,
    ]);

    const closeSkillPicker = useCallback(() => {
        setSkillPickerMode(null);
        setSlashQuery('');
    }, []);

    return {
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
        closeSkillPicker,
    };
}