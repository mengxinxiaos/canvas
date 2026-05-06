import { useState, useLayoutEffect } from 'react';

export function usePanelPosition(anchorNode, viewport, depCount = 0) {
    const [panelStyle, setPanelStyle] = useState({ opacity: 0 });

    useLayoutEffect(() => {
        if (!anchorNode) return;
        
        const nodeBottomScreenY = (anchorNode.position.y + anchorNode.size.h) * viewport.zoom + viewport.y;
        const nodeCenterScreenX = (anchorNode.position.x + anchorNode.size.w / 2) * viewport.zoom + viewport.x;
        
        const panelWidth = 520; // 根据组件 CSS 预设的定宽
        
        let top = nodeBottomScreenY + 16; 
        let left = nodeCenterScreenX - panelWidth / 2; 
        
        // 边缘碰撞检测
        if (left < 20) left = 20; 
        if (left + panelWidth > window.innerWidth - 20) left = window.innerWidth - panelWidth - 20;
        
        setPanelStyle({ 
            transform: `translate3d(${left}px, ${top}px, 0)`,
            opacity: 1,
            transition: 'opacity 0.15s ease-out' 
        }); 
        
    }, [
        anchorNode.position.x, anchorNode.position.y, 
        anchorNode.size.w, anchorNode.size.h, 
        viewport.zoom, viewport.x, viewport.y, 
        depCount // 依赖项变化时触发重计算
    ]);

    return panelStyle;
}