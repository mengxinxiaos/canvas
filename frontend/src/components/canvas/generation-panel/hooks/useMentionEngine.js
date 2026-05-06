// 负责核心的 @ 引用、光标追踪与原子化删除
import { useState, useMemo, useEffect } from 'react';

// 💡 变量名将 inputPictures 统一为更准确的 inputMedia
export function useMentionEngine(prompt, setPrompt, inputMedia, textareaRef, backdropRef) {
    const [mentionState, setMentionState] = useState({ active: false, query: '', startIndex: -1 });
    const [mentionIndex, setMentionIndex] = useState(0);

    // 💡 核心修复：动态计算可被 @ 的媒体列表，赋予正确的前缀 (图/视/音)
    const filteredMentions = useMemo(() => {
        if (!mentionState.active || !inputMedia || inputMedia.length === 0) return [];
        
        // 声明独立的计数器
        let imgCount = 0;
        let vidCount = 0;
        let audCount = 0;

        return inputMedia
            .map((media) => {
                let prefix = '图';
                let num = 0;
                
                // 根据类型分别累加计数
                if (media.type === 'video' || media.type === 'video_media') {
                    prefix = '视';
                    vidCount++;
                    num = vidCount;
                } else if (media.type === 'audio') {
                    prefix = '音';
                    audCount++;
                    num = audCount;
                } else {
                    prefix = '图';
                    imgCount++;
                    num = imgCount;
                }
                
                return { ...media, label: `${prefix}${num}` };
            })
            .filter(item => item.label.toLowerCase().includes(mentionState.query.toLowerCase()));
    }, [inputMedia, mentionState]);
    
    const adjustHeight = () => {
        if (textareaRef.current && backdropRef.current) {
            requestAnimationFrame(() => {
                textareaRef.current.style.height = 'auto';
                backdropRef.current.style.height = 'auto';
                const newHeight = `${textareaRef.current.scrollHeight}px`;
                textareaRef.current.style.height = newHeight;
                backdropRef.current.style.height = newHeight;
            });
        }
    };
    
    useEffect(() => {
        adjustHeight();
    }, [prompt]);

    const handleInput = (e) => {
        const val = e.target.value;
        setPrompt(val);
        
        // @ 符号雷达
        if (inputMedia && inputMedia.length > 0) {
            const cursor = e.target.selectionStart;
            const textBeforeCursor = val.slice(0, cursor);
            const lastAtIndex = textBeforeCursor.lastIndexOf('@');
            const query = textBeforeCursor.slice(lastAtIndex + 1);
            
            if (lastAtIndex !== -1 && !/\s/.test(query)) {
                setMentionState({ active: true, query, startIndex: lastAtIndex });
                setMentionIndex(0);
                return;
            }
        }
        setMentionState({ active: false, query: '', startIndex: -1 });
    };

    const insertMention = (media) => {
        const before = prompt.slice(0, mentionState.startIndex);
        const after = prompt.slice(textareaRef.current.selectionStart);
        const mentionText = `@${media.label} `; 
        
        setPrompt(before + mentionText + after);
        setMentionState({ active: false, query: '', startIndex: -1 });

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                const newCursor = mentionState.startIndex + mentionText.length;
                textareaRef.current.setSelectionRange(newCursor, newCursor);
            }
        }, 0);
    };

    const handleKeyDown = (e, handleSend) => {
        if (mentionState.active && filteredMentions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(p => (p + 1) % filteredMentions.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(p => (p - 1 + filteredMentions.length) % filteredMentions.length); return; }
            if (e.key === 'Enter') { e.preventDefault(); insertMention(filteredMentions[mentionIndex]); return; }
            if (e.key === 'Escape') { setMentionState({ active: false, query: '', startIndex: -1 }); return; }
        }

        // 💡 核心修复：原子化删除逻辑 (适配 图、视、音)
        if (e.key === 'Backspace') {
            const el = textareaRef.current;
            if (el && el.selectionStart === el.selectionEnd) {
                const cursor = el.selectionStart;
                const textBeforeCursor = prompt.slice(0, cursor);
                // 扩充正则匹配范围：@[图视音]后面跟数字
                const match = textBeforeCursor.match(/@[图视音]\d+\s*$/);
                
                if (match) {
                    e.preventDefault();
                    const matchLength = match[0].length;
                    setPrompt(textBeforeCursor.slice(0, -matchLength) + prompt.slice(cursor));
                    const newCursorPos = cursor - matchLength;
                    setTimeout(() => {
                        if (textareaRef.current) textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                    }, 0);
                    return; 
                }
            }
            e.stopPropagation();
        }

        if (e.key === 'Delete') e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            handleSend(); 
        }
    };

    return { mentionState, mentionIndex, filteredMentions, handleInput, insertMention, handleKeyDown };
}