// frontend/src/hooks/ui/useDismissablePopover.js

import { useEffect } from 'react';

export function useDismissablePopover({
    open,
    rootRef,
    onClose,
    closeOnEscape = true,
    closeOnOutsidePointerDown = true,
    capture = true,
} = {}) {
    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (e) => {
            if (!closeOnOutsidePointerDown) return;
            if (!rootRef?.current) return;
            if (rootRef.current.contains(e.target)) return;

            onClose?.();
        };

        const handleKeyDown = (e) => {
            if (!closeOnEscape) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose?.();
            }
        };

        window.addEventListener('pointerdown', handlePointerDown, capture);
        window.addEventListener('keydown', handleKeyDown, capture);

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown, capture);
            window.removeEventListener('keydown', handleKeyDown, capture);
        };
    }, [
        open,
        rootRef,
        onClose,
        closeOnEscape,
        closeOnOutsidePointerDown,
        capture,
    ]);
}