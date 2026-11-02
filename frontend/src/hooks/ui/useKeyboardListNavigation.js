// frontend/src/hooks/ui/useKeyboardListNavigation.js

import { useEffect, useState } from 'react';

function clampIndex(index, itemCount) {
    if (itemCount <= 0) return 0;
    return Math.min(Math.max(index, 0), itemCount - 1);
}

export function useKeyboardListNavigation({
    open,
    itemCount,
    onPickIndex,
    resetKey,

    initialIndex = 0,
    loop = false,
    capture = true,
    enabled = true,
} = {}) {
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        if (!open) return;
        setActiveIndex(clampIndex(initialIndex, itemCount));
    }, [
        open,
        resetKey,
        initialIndex,
        itemCount,
    ]);

    useEffect(() => {
        if (!open) return;

        setActiveIndex((prev) => clampIndex(prev, itemCount));
    }, [
        open,
        itemCount,
    ]);

    useEffect(() => {
        if (!open || !enabled) return;

        const handleKeyDown = (e) => {
            if (e.isComposing) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();

                setActiveIndex((prev) => {
                    if (itemCount <= 0) return 0;

                    if (loop) {
                        return (prev + 1) % itemCount;
                    }

                    return Math.min(prev + 1, itemCount - 1);
                });

                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();

                setActiveIndex((prev) => {
                    if (itemCount <= 0) return 0;

                    if (loop) {
                        return (prev - 1 + itemCount) % itemCount;
                    }

                    return Math.max(prev - 1, 0);
                });

                return;
            }

            if (e.key === 'Enter') {
                if (itemCount <= 0) return;

                e.preventDefault();
                e.stopPropagation();

                setActiveIndex((prev) => {
                    const safeIndex = clampIndex(prev, itemCount);
                    onPickIndex?.(safeIndex);
                    return safeIndex;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown, capture);

        return () => {
            window.removeEventListener('keydown', handleKeyDown, capture);
        };
    }, [
        open,
        enabled,
        itemCount,
        loop,
        capture,
        onPickIndex,
    ]);

    return {
        activeIndex,
        setActiveIndex,
    };
}