import { useCallback, useEffect, useMemo, useState } from 'react';
import { agentService } from '../../../services/api';

function normalizeSkill(raw) {
    if (!raw) return null;

    const name = String(raw.name || '').trim();
    if (!name) return null;

    return {
        name,
        title: raw.title || name,
        description: raw.description || raw.preview || '',
        preview: raw.preview || raw.description || '',
        category: raw.category || '技能',
        icon: raw.icon || null,
    };
}

export function useAgentSkills({ shareToken } = {}) {
    const [skills, setSkills] = useState([]);
    const [isLoadingSkills, setIsLoadingSkills] = useState(false);
    const [skillsError, setSkillsError] = useState('');

    const refreshSkills = useCallback(async () => {
        setIsLoadingSkills(true);
        setSkillsError('');

        try {
            const list = await agentService.listSkills(shareToken);

            const normalized = (list || [])
                .map(normalizeSkill)
                .filter(Boolean);

            setSkills(normalized);
        } catch (err) {
            console.error('[AgentSkills] 加载技能失败:', err);
            setSkillsError(err.message || '加载技能失败');
        } finally {
            setIsLoadingSkills(false);
        }
    }, [shareToken]);

    useEffect(() => {
        refreshSkills();
    }, [refreshSkills]);

    const skillNameSet = useMemo(() => {
        return new Set(skills.map((item) => item.name));
    }, [skills]);

    return {
        skills,
        skillNameSet,
        isLoadingSkills,
        skillsError,
        refreshSkills,
    };
}