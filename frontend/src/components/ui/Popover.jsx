import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPopoverPosition } from './popoverPosition.js';
import { useOverlayContainer } from './OverlayContainerContext.js';

export default function Popover({
    isOpen,
    onClose,
    trigger,
    children,
    className = '',
    width = 'auto',
}) {
    const getOverlayContainer = useOverlayContainer();
    const popoverRef = useRef(null);
    const triggerRef = useRef(null);
    const onCloseRef = useRef(onClose);
    const [position, setPosition] = useState(null);

    useLayoutEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useLayoutEffect(() => {
        if (!isOpen) return;
        const popup = popoverRef.current;
        const anchor = triggerRef.current;

        const reposition = () => {
            const rect = popup.getBoundingClientRect();
            const next = getPopoverPosition(
                anchor.getBoundingClientRect(),
                { width: rect.width, height: popup.scrollHeight + 2 },
                { width: window.innerWidth, height: window.innerHeight },
            );
            setPosition(previous => (
                previous && Object.keys(next).every(key => previous[key] === next[key])
                    ? previous
                    : next
            ));
        };

        reposition();
        const observer = new ResizeObserver(reposition);
        observer.observe(anchor);
        observer.observe(popup);
        window.addEventListener('resize', reposition);
        document.addEventListener('scroll', reposition, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', reposition);
            document.removeEventListener('scroll', reposition, true);
        };
    }, [isOpen, width]);

    useEffect(() => {
        if (!isOpen) return;
        const handlePointerDown = event => {
            if (!popoverRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
                onCloseRef.current();
            }
        };
        const handleKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
                triggerRef.current?.querySelector('button, [tabindex]')?.focus();
            }
        };
        document.addEventListener('pointerdown', handlePointerDown, true);
        document.addEventListener('keydown', handleKeyDown, true);
        const focusFrame = requestAnimationFrame(() => {
            popoverRef.current?.querySelector(
                'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])',
            )?.focus();
        });
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener('pointerdown', handlePointerDown, true);
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isOpen]);

    return (
        <div className="relative inline-block">
            <div ref={triggerRef} onClick={event => event.stopPropagation()}>{trigger}</div>
            {isOpen && createPortal(
                <div
                    ref={popoverRef}
                    data-popover-placement={position?.placement}
                    className={`fixed z-[200] overflow-y-auto overscroll-contain bg-[#242424] border border-[#333] rounded-2xl shadow-2xl ${className}`}
                    style={{
                        width,
                        maxWidth: 'calc(100vw - 24px)',
                        left: position?.left ?? 0,
                        top: position?.top ?? 0,
                        maxHeight: position?.maxHeight ?? 'calc(100vh - 24px)',
                        visibility: position ? 'visible' : 'hidden',
                    }}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={event => event.stopPropagation()}
                    onWheel={event => event.stopPropagation()}
                >
                    {children}
                </div>,
                getOverlayContainer(),
            )}
        </div>
    );
}
