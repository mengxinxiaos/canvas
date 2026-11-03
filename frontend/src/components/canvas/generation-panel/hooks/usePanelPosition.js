import { useState, useLayoutEffect } from 'react';
import { getPanelLayout } from '../utils/panelLayout.js';

export function usePanelPosition(anchorNode, viewport, panelRef, expanded, originRef) {
    const [style, setStyle] = useState({ opacity: 0, width: 520 });
    const { x, y } = anchorNode.position;
    const { w, h } = anchorNode.size;
    const { zoom, x: panX, y: panY } = viewport;

    useLayoutEffect(() => {
        const panel = panelRef.current;
        const origin = originRef.current;
        if (!panel || !origin || expanded) return;
        const reposition = () => {
            const parentRect = origin.getBoundingClientRect();
            const layout = getPanelLayout({
                anchor: {
                    left: x * zoom + panX + parentRect.left,
                    top: y * zoom + panY + parentRect.top,
                    width: w * zoom,
                    height: h * zoom,
                },
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
            });
            const next = {
                width: layout.width,
                maxHeight: layout.maxHeight,
                transform: `translate3d(${layout.left}px, ${layout.top}px, 0)`,
                opacity: 1,
            };
            setStyle(previous => Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
        };
        reposition();
        const observer = new ResizeObserver(reposition);
        observer.observe(panel);
        if (origin?.offsetParent) observer.observe(origin.offsetParent);
        window.addEventListener('resize', reposition);
        document.addEventListener('scroll', reposition, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', reposition);
            document.removeEventListener('scroll', reposition, true);
        };
    }, [x, y, w, h, zoom, panX, panY, panelRef, expanded, originRef]);
    return style;
}
