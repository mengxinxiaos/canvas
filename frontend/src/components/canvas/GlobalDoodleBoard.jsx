import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Check, X, Eraser, PenTool, Loader2, Undo } from 'lucide-react';
import { mediaService } from '../../services/api';
import { getMediaUrl } from '../../utils/helpers';

const COLORS = ['#ffffff', '#000000', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7'];

export default function GlobalDoodleBoard({ viewport, screenToCanvas, projectId, onSave, onCancel }) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [paths, setPaths] = useState([]);
    const [currentPath, setCurrentPath] = useState(null);
    const [color, setColor] = useState('#ffffff');
    const [size, setSize] = useState(8); 
    const [isEraser, setIsEraser] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [cursorPos, setCursorPos] = useState(null);

    // ==========================================
    // 渲染引擎：融合了贝塞尔平滑算法的高性能渲染
    // ==========================================
    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const drawPath = (path) => {
            if (path.points.length === 0) return;
            ctx.beginPath();
            
            if (path.isEraser) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = path.color;
            }
            
            ctx.lineWidth = path.size * viewport.zoom * dpr;

            // 坐标映射辅助函数 (世界坐标 -> 屏幕像素坐标)
            const mapX = (x) => (x * viewport.zoom + viewport.x) * dpr;
            const mapY = (y) => (y * viewport.zoom + viewport.y) * dpr;

            const first = path.points[0];
            ctx.moveTo(mapX(first.x), mapY(first.y));

            // 如果点太少，画不成曲线，直接画点或直线
            if (path.points.length < 3) {
                if (path.points.length === 2) {
                    ctx.lineTo(mapX(path.points[1].x), mapY(path.points[1].y));
                } else {
                    ctx.lineTo(mapX(first.x) + 0.1, mapY(first.y) + 0.1);
                }
                ctx.stroke();
                return;
            }

            // 🌟 核心工业级算法：标准贝塞尔平滑
            for (let i = 1; i < path.points.length - 1; i++) {
                const p1 = path.points[i];
                const p2 = path.points[i + 1];
                // 计算实际世界坐标的中点
                const xc = (p1.x + p2.x) / 2;
                const yc = (p1.y + p2.y) / 2;
                // 用贝塞尔曲线连接屏幕坐标
                ctx.quadraticCurveTo(mapX(p1.x), mapY(p1.y), mapX(xc), mapY(yc));
            }
            // 补齐最后一段
            const last = path.points[path.points.length - 1];
            ctx.lineTo(mapX(last.x), mapY(last.y));
            
            ctx.stroke();
        };

        paths.forEach(drawPath);
        if (currentPath) drawPath(currentPath);
        ctx.globalCompositeOperation = 'source-over';
    }, [paths, currentPath, viewport]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        
        const resizeCanvas = () => {
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            render();
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [render]);

    const handlePointerDown = (e) => {
        e.stopPropagation();
        if (e.button !== 0 || e.target.closest('.no-doodle')) return;
        setIsDrawing(true);
        const pos = screenToCanvas(e.clientX, e.clientY);
        setCurrentPath({ points: [pos], color, size, isEraser });
    };

    const handlePointerMove = (e) => {
        e.stopPropagation();
        
        if (!e.target.closest('.no-doodle')) {
            setCursorPos({ x: e.clientX, y: e.clientY });
        } else {
            setCursorPos(null); 
        }

        if (!isDrawing || !currentPath) return;
        
        const pos = screenToCanvas(e.clientX, e.clientY);

        setCurrentPath(prev => {
            if (e.shiftKey) {
                const startPos = prev.points[0];
                const dx = Math.abs(pos.x - startPos.x);
                const dy = Math.abs(pos.y - startPos.y);
                
                let snappedPos;
                if (dx > dy) {
                    snappedPos = { x: pos.x, y: startPos.y }; 
                } else {
                    snappedPos = { x: startPos.x, y: pos.y }; 
                }
                return { ...prev, points: [startPos, snappedPos] };
            }
            
            return { ...prev, points: [...prev.points, pos] };
        });
    };

    const handlePointerUp = (e) => {
        e.stopPropagation();
        if (!isDrawing || !currentPath) return;
        setIsDrawing(false);
        setPaths(prev => [...prev, currentPath]);
        setCurrentPath(null);
    };

    const handlePointerLeave = (e) => {
        setCursorPos(null); 
        handlePointerUp(e);
    };

    const handleUndo = () => {
        if (paths.length > 0) {
            setPaths(prev => prev.slice(0, -1));
        }
    };

    // ==========================================
    // 导出引擎：同样注入贝塞尔平滑算法
    // ==========================================
    const handleSaveClick = async () => {
        if (paths.length === 0) {
            onCancel(); return;
        }
        setIsSaving(true);
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        paths.forEach(path => {
            const r = path.size / 2;
            path.points.forEach(p => {
                minX = Math.min(minX, p.x - r); minY = Math.min(minY, p.y - r);
                maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r);
            });
        });

        const padding = 20;
        minX -= padding; minY -= padding; maxX += padding; maxY += padding;
        const width = maxX - minX; const height = maxY - minY;

        if (width <= padding * 2 || height <= padding * 2) {
            setIsSaving(false); onCancel(); return;
        }

        const offCanvas = document.createElement('canvas');
        offCanvas.width = width; offCanvas.height = height;
        const octx = offCanvas.getContext('2d');
        octx.lineCap = 'round'; octx.lineJoin = 'round';

        // 局部坐标映射
        const mapX = (x) => x - minX;
        const mapY = (y) => y - minY;

        paths.forEach(path => {
            if (path.points.length === 0) return;
            octx.beginPath();
            octx.strokeStyle = path.isEraser ? 'rgba(0,0,0,1)' : path.color;
            octx.globalCompositeOperation = path.isEraser ? 'destination-out' : 'source-over';
            octx.lineWidth = path.size; 
            
            const p0 = path.points[0];
            octx.moveTo(mapX(p0.x), mapY(p0.y));

            // 🌟 导出时同样使用贝塞尔平滑
            if (path.points.length < 3) {
                if (path.points.length === 2) {
                    octx.lineTo(mapX(path.points[1].x), mapY(path.points[1].y));
                } else {
                    octx.lineTo(mapX(p0.x) + 0.1, mapY(p0.y) + 0.1); 
                }
            } else {
                for(let i = 1; i < path.points.length - 1; i++) {
                    const p1 = path.points[i];
                    const p2 = path.points[i+1];
                    const xc = (p1.x + p2.x) / 2;
                    const yc = (p1.y + p2.y) / 2;
                    octx.quadraticCurveTo(mapX(p1.x), mapY(p1.y), mapX(xc), mapY(yc));
                }
                const last = path.points[path.points.length - 1];
                octx.lineTo(mapX(last.x), mapY(last.y));
            }
            octx.stroke();
        });

        offCanvas.toBlob(async (blob) => {
            const file = new File([blob], `doodle_${Date.now()}.png`, { type: 'image/png' });
            try {
                const res = await mediaService.uploadFile(file, projectId, 'doodle');
                const url = getMediaUrl(res.url);
                onSave(url, minX, minY, width, height); 
            } catch(e) {
                console.error("上传涂鸦失败", e);
                setIsSaving(false);
            }
        });
    };

    return (
        <div className="absolute inset-0 z-[500] overflow-hidden">
            {cursorPos && (
                <div 
                    className="pointer-events-none fixed rounded-full z-[501] border shadow-sm transition-transform duration-75"
                    style={{
                        left: cursorPos.x,
                        top: cursorPos.y,
                        width: size * viewport.zoom,
                        height: size * viewport.zoom,
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: isEraser ? 'rgba(255, 255, 255, 0.4)' : color,
                        borderColor: isEraser ? '#666' : 'white',
                        opacity: 0.8
                    }}
                />
            )}

            <canvas 
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave} 
                onDoubleClick={(e) => e.stopPropagation()}
                className="absolute top-0 left-0 touch-none cursor-none"
            />
            
            <div className="no-doodle absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#212121] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] border border-white/10 flex flex-col pointer-events-auto overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-200 z-[600]">
                
                <div className="flex items-center gap-2 p-2 border-b border-white/5 bg-[#2a2a2a]">
                    <div className="flex items-center gap-1.5 px-2">
                        {COLORS.map(c => (
                            <button key={c} onClick={() => { setColor(c); setIsEraser(false); }} 
                                    className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${color === c && !isEraser ? 'border-white scale-110 shadow-md' : 'border-transparent hover:scale-110'}`} 
                                    style={{ backgroundColor: c }} title={`选择颜色 ${c}`} />
                        ))}
                    </div>
                    <div className="w-px h-6 bg-white/10 mx-1"></div>
                    
                    <div className="flex items-center gap-3 px-2 text-neutral-400">
                        <span className="text-xs font-mono w-4 text-right">{size}</span>
                        <input 
                            type="range" 
                            min="2" 
                            max="80" 
                            value={size} 
                            onChange={(e) => setSize(Number(e.target.value))} 
                            onPointerDown={(e) => e.stopPropagation()} 
                            onPointerMove={(e) => e.stopPropagation()} 
                            className="w-24 h-1.5 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                            title="画笔/橡皮擦大小"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between p-2 px-3 gap-6">
                    <div className="flex items-center bg-[#1a1a1a] rounded-xl p-1 border border-white/5">
                        <button onClick={() => setIsEraser(false)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${!isEraser ? 'bg-[#333] text-white shadow-sm' : 'text-neutral-400 hover:text-white'}`}>
                            <PenTool size={16} /> 画笔
                        </button>
                        <button onClick={() => setIsEraser(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${isEraser ? 'bg-[#333] text-white shadow-sm' : 'text-neutral-400 hover:text-white'}`}>
                            <Eraser size={16} /> 橡皮擦
                        </button>
                    </div>
                    
                    <div className="flex items-center">
                        <button 
                            onClick={handleUndo} 
                            disabled={paths.length === 0} 
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="撤销上一步"
                        >
                            <Undo size={16} /> 撤销
                        </button>
                    </div>
                    
                    <div className="w-px h-5 bg-white/10"></div>

                    <div className="flex items-center gap-2">
                        <button onClick={onCancel} disabled={isSaving} className="px-4 py-1.5 rounded-xl text-sm font-medium text-neutral-300 hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                            取消
                        </button>
                        <button onClick={handleSaveClick} disabled={isSaving || paths.length === 0} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-xl text-sm font-medium transition-all shadow-lg cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100">
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            {isSaving ? '正在生成...' : '完成贴图'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}