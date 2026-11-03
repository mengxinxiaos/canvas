import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { usePanelPosition } from '../hooks/usePanelPosition';
import { OverlayContainerContext } from '../../../ui/OverlayContainerContext';
import './PanelFrame.css';

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

export default function PanelFrame({ anchorNode, viewport, mode, onPresentationChange, children }) {
    const [expanded, setExpanded] = useState(false);
    const panelRef = useRef(null);
    const originRef = useRef(null);
    const toggleRef = useRef(null);
    const anchoredStyle = usePanelPosition(anchorNode, viewport, panelRef, expanded, originRef);
    const getOverlayContainer = useCallback(() => (
        panelRef.current?.dataset.panelExpanded === 'true' ? panelRef.current : document.body
    ), []);

    // Top-layer promotion covers canvas widgets regardless of their z-index.
    // The same DOM node/editor is retained when the panel changes presentation.
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!expanded || typeof panel?.showPopover !== 'function') return;
        panel.showPopover();
        return () => {
            if (panel.matches(':popover-open')) panel.hidePopover();
        };
    }, [expanded]);

    useEffect(() => {
        if (!expanded) return;
        const panel = panelRef.current;
        const toggle = toggleRef.current;
        let background = originRef.current;
        while (background?.parentElement && background.parentElement !== document.body) {
            background = background.parentElement;
        }
        const previousInert = background?.inert;
        const previousOverflow = document.body.style.overflow;
        if (background) background.inert = true;
        document.body.style.overflow = 'hidden';
        toggle?.focus({ preventScroll: true });

        const handleKeyDown = event => {
            if (event.isComposing || event.defaultPrevented) return;
            // Parameter and mention popups own the first Escape press.
            if (document.querySelector('[data-popover-placement], .tippy-box[data-state="visible"]')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setExpanded(false);
            } else if (event.key === 'Tab') {
                const focusable = [...panel.querySelectorAll(FOCUSABLE)].filter(element => element.getClientRects().length);
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
                    event.preventDefault();
                    (event.shiftKey ? last : first)?.focus();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            if (background) background.inert = previousInert;
            document.body.style.overflow = previousOverflow;
            toggle?.focus({ preventScroll: true });
        };
    }, [expanded]);

    const stopInteraction = event => event.stopPropagation();
    return (
        <>
            <span ref={originRef} aria-hidden="true" className="absolute top-0 left-0 h-0 w-0 pointer-events-none" />
            {createPortal(
                <div
                    ref={panelRef}
                    data-panel-for={anchorNode.id}
                    data-panel-expanded={expanded}
                    role={expanded ? 'dialog' : 'region'}
                    aria-modal={expanded || undefined}
                    aria-label="生成面板"
                    popover={expanded ? 'manual' : undefined}
                    className="generation-panel no-wheel no-drag fixed top-0 left-0 bg-[#212121] rounded-3xl shadow-[0_24px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 flex flex-col p-4 pointer-events-auto overflow-hidden"
                    style={expanded ? {
                        inset: 0,
                        margin: 'auto',
                        width: 'min(1280px, 90vw)',
                        height: 'min(820px, 85dvh)',
                        maxWidth: 'calc(100vw - 24px)',
                        maxHeight: 'calc(100dvh - 24px)',
                        zIndex: 10000, // Fallback for browsers without the Popover API.
                    } : { ...anchoredStyle, margin: 0, zIndex: 100 }}
                    onPointerDown={stopInteraction}
                    onWheel={stopInteraction}
                    onKeyDown={expanded ? stopInteraction : undefined}
                    onPaste={expanded ? stopInteraction : undefined}
                >
                    <div className="shrink-0 flex items-center justify-between gap-3 pb-3">
                        <span className="text-xs font-medium text-neutral-400">{mode === 'image' ? '图片生成' : '视频生成'}</span>
                        <button
                            ref={toggleRef}
                            type="button"
                            aria-label={expanded ? '收起面板' : '放大编辑'}
                            aria-expanded={expanded}
                            title={expanded ? '收起面板（Esc）' : '放大编辑'}
                            onClick={() => { onPresentationChange?.(); setExpanded(value => !value); }}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                        >
                            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            {expanded ? '收起' : '放大'}
                        </button>
                    </div>
                    <OverlayContainerContext.Provider value={getOverlayContainer}>
                        {children(expanded)}
                    </OverlayContainerContext.Provider>
                </div>,
                document.body,
            )}
        </>
    );
}
