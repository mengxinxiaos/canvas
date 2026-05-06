import React, { useMemo, useRef, useCallback } from 'react';

// 🌟 性能优化核心：将节点抽离为独立组件，并使用 React.memo
// 这样当 viewport (视口) 发生改变时，只要节点数据不变，就不会重新渲染这几百个 div
const MinimapNodes = React.memo(({ nodes, minX, minY, scale, mapOffsetX, mapOffsetY }) => {
    return (
        <>
            {nodes.map(n => (
                <div 
                    key={n.id}
                    className="absolute rounded-[2px]"
                    style={{
                        left: mapOffsetX + (n.position.x - minX) * scale,
                        top: mapOffsetY + (n.position.y - minY) * scale,
                        width: Math.max(n.size.w * scale, 2), 
                        height: Math.max(n.size.h * scale, 2),
                        backgroundColor: n.type === 'group' ? 'rgba(245, 158, 11, 0.2)' : '#4b5563',
                        border: n.type === 'group' ? '1px solid rgba(245, 158, 11, 0.5)' : 'none'
                    }}
                />
            ))}
        </>
    );
});

export default function CanvasMinimap({ nodes, viewport, updateViewport }) {
    const minimapRef = useRef(null);
    const isDragging = useRef(false);

    // 计算所有节点的边界范围
    const { minX, minY, width, height } = useMemo(() => {
        if (!nodes || nodes.length === 0) return { minX: 0, minY: 0, width: 2000, height: 2000 };
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
            maxX = Math.max(maxX, n.position.x + n.size.w);
            maxY = Math.max(maxY, n.position.y + n.size.h);
        });
        
        const padding = 600; 
        return {
            minX: minX - padding,
            minY: minY - padding,
            width: (maxX - minX) + padding * 2,
            height: (maxY - minY) + padding * 2
        };
    }, [nodes]);

    const minimapWidth = 240;
    const minimapHeight = 160;
    
    const scaleX = minimapWidth / width;
    const scaleY = minimapHeight / height;
    const scale = Math.min(scaleX, scaleY); 

    const mapOffsetX = (minimapWidth - width * scale) / 2;
    const mapOffsetY = (minimapHeight - height * scale) / 2;

    // 封装跳转逻辑
    const jumpToPosition = useCallback((clientX, clientY) => {
        if (!minimapRef.current) return;
        const rect = minimapRef.current.getBoundingClientRect();
        const clickX = clientX - rect.left;
        const clickY = clientY - rect.top;

        // 小地图坐标 -> 真实世界坐标
        const worldX = (clickX - mapOffsetX) / scale + minX;
        const worldY = (clickY - mapOffsetY) / scale + minY;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        
        updateViewport(vp => ({
            ...vp,
            x: vw / 2 - worldX * vp.zoom,
            y: vh / 2 - worldY * vp.zoom
        }));
    }, [mapOffsetX, mapOffsetY, scale, minX, minY, updateViewport]);

    // 👇 完善的拖拽事件处理 👇
    const handlePointerDown = (e) => {
        isDragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId); // 锁定鼠标焦点，移出框外也能拖
        jumpToPosition(e.clientX, e.clientY);
    };

    const handlePointerMove = (e) => {
        if (!isDragging.current) return;
        jumpToPosition(e.clientX, e.clientY);
    };

    const handlePointerUp = (e) => {
        isDragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    return (
        <div 
            ref={minimapRef}
            className="absolute bottom-16 left-0 bg-[#151515]/95 backdrop-blur-md border border-neutral-700/60 rounded-xl overflow-hidden shadow-2xl cursor-crosshair touch-none"
            style={{ width: minimapWidth, height: minimapHeight }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp} // 防止意外中断
        >
            {/* 1. 渲染隔离的节点层（拖拽时不会重新渲染） */}
            <MinimapNodes 
                nodes={nodes} 
                minX={minX} 
                minY={minY} 
                scale={scale} 
                mapOffsetX={mapOffsetX} 
                mapOffsetY={mapOffsetY} 
            />
            
            {/* 2. 渲染当前屏幕视口指示器 (只有这个框在疯狂更新) */}
            <div 
                className="absolute border-[1.5px] border-blue-500 bg-blue-500/10 pointer-events-none"
                style={{
                    left: mapOffsetX + (-viewport.x / viewport.zoom - minX) * scale,
                    top: mapOffsetY + (-viewport.y / viewport.zoom - minY) * scale,
                    width: (window.innerWidth / viewport.zoom) * scale,
                    height: (window.innerHeight / viewport.zoom) * scale,
                    // 硬件加速，让框的移动不引起重排
                    willChange: 'left, top, width, height' 
                }}
            />
        </div>
    );
}