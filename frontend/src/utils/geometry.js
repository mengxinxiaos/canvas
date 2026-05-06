// utils/geometry.js
import { CANVAS_CONFIG } from '../config/canvas.config';

/**
 * 计算两个坐标点之间的三次贝塞尔曲线路径 (S型曲线)
 * @param {Object} sourcePos - 起点坐标 {x, y}
 * @param {Object} targetPos - 终点坐标 {x, y}
 * @returns {string} SVG Path d 属性字符串
 */
export const calculateBezierPath = (sourcePos, targetPos) => {
    const { x: x1, y: y1 } = sourcePos;
    const { x: x2, y: y2 } = targetPos;
    
    // 使用配置表里的参数计算控制点偏移量
    const offset = Math.abs(x2 - x1) * CANVAS_CONFIG.EDGE.CTRL_RATIO;
    const ctrlOffset = Math.max(CANVAS_CONFIG.EDGE.MIN_CTRL_OFFSET, offset);
    
    return `M ${x1} ${y1} C ${x1 + ctrlOffset} ${y1}, ${x2 - ctrlOffset} ${y2}, ${x2} ${y2}`;
};