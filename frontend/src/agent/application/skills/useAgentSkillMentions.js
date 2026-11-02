import { useMemo } from 'react';

export function mergeSkillNamesInOrder(...groups) {
    const result = [];
    const seen = new Set();

    for (const group of groups) {
        for (const name of group || []) {
            const normalized = String(name || '').trim();
            if (!normalized || seen.has(normalized)) continue;

            seen.add(normalized);
            result.push(normalized);
        }
    }

    return result;
}

export function extractSkillNamesFromInput(input, availableSkills = []) {
    const text = String(input || '');
    if (!text) return [];

    const result = [];

    for (const skill of availableSkills || []) {
        const name = String(skill?.name || '').trim();
        if (!name) continue;

        const token = `/${name}`;

        if (text.includes(token)) {
            result.push(name);
        }
    }

    return result;
}

export function getActiveSlashTrigger(text, caretIndex) {
    const value = String(text || '');
    const safeCaret = Number.isFinite(caretIndex) ? caretIndex : value.length;
    const beforeCaret = value.slice(0, safeCaret);

    const slashIndex = beforeCaret.lastIndexOf('/');
    if (slashIndex < 0) return null;

    const query = beforeCaret.slice(slashIndex + 1);

    // 当前 slash query 中出现空白，说明这个 /skill token 已经结束，不再处于唤起状态
    if (/\s/.test(query)) return null;

    return {
        slashIndex,
        query,
    };
}

export function insertSkillMention(text, caretIndex, skillName) {
    const value = String(text || '');
    const safeCaret = Number.isFinite(caretIndex) ? caretIndex : value.length;
    const trigger = getActiveSlashTrigger(value, safeCaret);

    const token = `/${skillName} `;

    if (!trigger) {
        const prefix = value.slice(0, safeCaret);
        const suffix = value.slice(safeCaret);

        return {
            nextValue: `${prefix}${token}${suffix}`,
            nextCaret: prefix.length + token.length,
        };
    }

    const before = value.slice(0, trigger.slashIndex);
    const after = value.slice(safeCaret);

    return {
        nextValue: `${before}${token}${after}`,
        nextCaret: before.length + token.length,
    };
}

export function useAgentSkillMentions({
    input,
    availableSkills,
    selectedSkillNames,
}) {
    const mentionedSkillNames = useMemo(() => {
        return extractSkillNamesFromInput(input, availableSkills);
    }, [input, availableSkills]);

    const skillNamesForTurn = useMemo(() => {
        return mergeSkillNamesInOrder(
            selectedSkillNames,
            mentionedSkillNames,
        );
    }, [selectedSkillNames, mentionedSkillNames]);

    return {
        mentionedSkillNames,
        skillNamesForTurn,
    };
}