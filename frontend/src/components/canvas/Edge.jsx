import React, { memo } from 'react';

const Edge = memo(({ edge, fromNode, toNode, isSelected, onPointerDown }) => {
    if (!fromNode || !toNode) return null;
    
    const x1 = fromNode.position.x + fromNode.size.w; 
    const y1 = fromNode.position.y + fromNode.size.h / 2;
    const x2 = toNode.position.x; 
    const y2 = toNode.position.y + toNode.size.h / 2;
    
    // 贝塞尔曲线控制点
    const ctrlOffset = Math.max(50, Math.abs(x2 - x1) * 0.4);
    const path = `M ${x1} ${y1} C ${x1 + ctrlOffset} ${y1}, ${x2 - ctrlOffset} ${y2}, ${x2} ${y2}`;
    
    // 鼠标按下事件处理
    const handlePointerDown = (e) => {
        // 💡 修复：如果不是鼠标左键（例如中键=1，右键=2），直接忽略，防止中键拖拽画布时误触选中
        if (e.button !== 0) return; 
        onPointerDown(e, edge.id);
    };

    return (
      <g data-edge-id={edge.id}>
        {/* 交互感应层（透明的宽线条，方便鼠标点击） */}
        <path 
            d={path} 
            fill="none" 
            stroke="transparent" 
            strokeWidth={15}
            vectorEffect="non-scaling-stroke"
            className="pointer-events-auto cursor-pointer" 
            onPointerDown={handlePointerDown} 
        />
        {/* 视觉展示层 */}
        <path 
            d={path} 
            fill="none" 
            stroke={isSelected ? "#3b82f6" : "#404040"} 
            strokeWidth={isSelected ? 3 : 2}
            vectorEffect="non-scaling-stroke"
            strokeDasharray="none"
            className="pointer-events-none" 
        />
      </g>
    );
}, (prevProps, nextProps) => {
    // 🚀 工业级性能优化：自定义深度对比逻辑，拦截无用的重渲染

    // 1. 基础状态对比
    if (prevProps.edge.id !== nextProps.edge.id) return false;
    if (prevProps.isSelected !== nextProps.isSelected) return false;

    // 2. 剥离无用属性，只对比影响连线物理形状的几何数据 (坐标、宽、高)
    const pFrom = prevProps.fromNode;
    const nFrom = nextProps.fromNode;
    if (!pFrom || !nFrom) return pFrom === nFrom;
    if (
        pFrom.position.x !== nFrom.position.x || 
        pFrom.position.y !== nFrom.position.y || 
        pFrom.size.w !== nFrom.size.w || 
        pFrom.size.h !== nFrom.size.h
    ) return false;

    const pTo = prevProps.toNode;
    const nTo = nextProps.toNode;
    if (!pTo || !nTo) return pTo === nTo;
    if (
        pTo.position.x !== nTo.position.x || 
        pTo.position.y !== nTo.position.y || 
        pTo.size.w !== nTo.size.w || 
        pTo.size.h !== nTo.size.h
    ) return false;

    // 3. 故意忽略 onPointerDown 函数的对比！
    // 因为父组件传进来的匿名函数每次渲染都会变，如果对比它，memo 就彻底失效了。
    return true; 
});

export default Edge;