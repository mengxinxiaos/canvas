import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Loader2, Pen, Eraser, Undo } from 'lucide-react';
import { createPortal } from 'react-dom';
import { mediaService } from '../../services/api';
import { getMediaUrl } from '../../utils/helpers';

export default function DoodleCanvas({ src, projectId, onSave, onCancel, zoom }) {
    const canvasRef = useRef(null);
    const bgImageRef = useRef(null); // 用于缓存底图的引用
    const ctxRef = useRef(null);
    
    // 基础状态
    const [isDrawing, setIsDrawing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // 工具状态
    const [mode, setMode] = useState('pen'); 
    const [color, setColor] = useState('#ff0000');
    const [brushSize, setBrushSize] = useState(15); 
    
    // 矢量历史栈
    const historyRef = useRef([]);      
    const historyStepRef = useRef(-1);  
    const currentStrokeRef = useRef(null); 
    const [canUndo, setCanUndo] = useState(false);

    // ==========================================
    // 工业级算法：完美贝塞尔曲线绘制
    // ==========================================
    const drawStroke = (ctx, stroke) => {
        const pts = stroke.points;
        if (pts.length === 0) return;

        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.brushSize;
        ctx.globalCompositeOperation = stroke.mode === 'eraser' ? 'destination-out' : 'source-over';

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);

        // 如果只有一个点，画个圆点
        if (pts.length < 3) {
            ctx.lineTo(pts[0].x, pts[0].y);
            ctx.stroke();
            return;
        }

        // 标准贝塞尔平滑：用线段的中点作为控制点连接
        for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        // 补齐最后一段
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
    };

    // ==========================================
    // 渲染引擎：高频清空并重绘画布
    // ==========================================
    const redrawCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (!canvas || !ctx || !bgImageRef.current) return;

        // 🌟 1. 清空画布 (注意：现在只清空透明的涂鸦层，底图安全了)
        ctx.clearRect(0, 0, bgImageRef.current.naturalWidth, bgImageRef.current.naturalHeight);

        // 🌟 2. 重放历史笔画
        const strokesToDraw = historyRef.current.slice(0, historyStepRef.current + 1);
        strokesToDraw.forEach(stroke => drawStroke(ctx, stroke));
        
        // 恢复当前工具状态
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        ctx.globalCompositeOperation = mode === 'eraser' ? 'destination-out' : 'source-over';
    };

    const handleUndo = () => {
        if (historyStepRef.current >= -1) {
            historyStepRef.current -= 1;
            redrawCanvas(); 
            setCanUndo(historyStepRef.current >= 0);
        }
    };

    // 画布初始化 (支持高分屏适配)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const img = new Image();
        img.crossOrigin = 'anonymous'; 
        img.onload = () => {
            bgImageRef.current = img; 
            const ctx = canvas.getContext('2d');
            
            // 🌟 修复高分屏发虚/锯齿：获取设备物理像素比
            const dpr = window.devicePixelRatio || 1;
            
            // 内部物理分辨率放大
            canvas.width = img.naturalWidth * dpr;
            canvas.height = img.naturalHeight * dpr;
            
            // 缩放上下文，使后续的绘图逻辑可以继续使用 1x 的坐标系
            ctx.scale(dpr, dpr);
            ctx.lineCap = 'round'; 
            ctx.lineJoin = 'round'; 
            ctxRef.current = ctx;

            redrawCanvas();
        };
        img.src = src;
    }, [src]);

    // 获取兼容各种比例的准确坐标
    const getPos = (e) => { 
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect(); 
        // 将鼠标的 DOM 像素，映射回图片的实际像素 (1x 逻辑空间)
        const scaleX = bgImageRef.current.naturalWidth / rect.width;
        const scaleY = bgImageRef.current.naturalHeight / rect.height;
        return { 
            x: (e.clientX - rect.left) * scaleX, 
            y: (e.clientY - rect.top) * scaleY 
        }; 
    };

    const startDrawing = (e) => { 
        e.stopPropagation(); 
        setIsDrawing(true); 
        const pos = getPos(e); 
        
        currentStrokeRef.current = { mode, color, brushSize, points: [pos] };

        // 瞬间触发绘制
        redrawCanvas();
        drawStroke(ctxRef.current, currentStrokeRef.current);
    };
    
    const draw = (e) => { 
        e.stopPropagation(); 
        if (!isDrawing || !currentStrokeRef.current) return; 
        
        const pos = getPos(e); 
        currentStrokeRef.current.points.push(pos); 
        
        // 🌟 修复边缘锯齿的关键：每一帧都完全重绘当前笔画
        redrawCanvas();
        drawStroke(ctxRef.current, currentStrokeRef.current);
    };
    
    const stopDrawing = (e) => { 
        e.stopPropagation(); 
        if (isDrawing && currentStrokeRef.current) {
            setIsDrawing(false); 
            
            const newHistory = historyRef.current.slice(0, historyStepRef.current + 1);
            newHistory.push(currentStrokeRef.current);
            if (newHistory.length > 100) newHistory.shift(); 
            
            historyRef.current = newHistory;
            historyStepRef.current = newHistory.length - 1;
            setCanUndo(true);
            
            currentStrokeRef.current = null;
            redrawCanvas(); // 最后整理一次画布
        }
    };

    // ==========================================
    // 保存功能：合成底图与涂鸦层
    // ==========================================
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // 🌟 离屏合并：创建一个不显示的 Canvas 来把底图和涂鸦压在一块
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = bgImageRef.current.naturalWidth;
            exportCanvas.height = bgImageRef.current.naturalHeight;
            const exportCtx = exportCanvas.getContext('2d');

            // 1. 画底图
            exportCtx.drawImage(bgImageRef.current, 0, 0);
            
            // 2. 将我们的涂鸦层盖上去 (注意此时涂鸦层是高分辨率的，绘制时自动缩放回去)
            exportCtx.drawImage(canvasRef.current, 0, 0, exportCanvas.width, exportCanvas.height);

            const blob = await new Promise(resolve => exportCanvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], `doodle_${Date.now()}.png`, { type: 'image/png' });
            const res = await mediaService.uploadFile(file, projectId, 'doodle');
            onSave(getMediaUrl(res.url));
        } catch (e) { alert("保存失败"); } finally { setIsSaving(false); }
    };

    return createPortal(
        <div className="fixed inset-0 z-[400] bg-black/95 flex flex-col items-center justify-center p-8 backdrop-blur-md animate-in fade-in no-wheel" onPointerDown={e => e.stopPropagation()}>
            
            {/* 🌟 核心图层分离：底图 <img> 在下，涂鸦 <canvas> 绝对定位在上面 */}
            <div className="relative inline-flex items-center justify-center max-w-full max-h-[80vh]">
                <img 
                    src={src} 
                    className="block max-w-full max-h-[80vh] object-contain shadow-2xl rounded-lg pointer-events-none select-none" 
                    alt="doodle-bg" 
                    crossOrigin="anonymous" 
                />
                <canvas 
                    ref={canvasRef} 
                    className={`absolute inset-0 w-full h-full touch-none ${mode === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
                    onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerLeave={stopDrawing} 
                />
            </div>
            
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center bg-[#1c1c1c] p-3 px-6 rounded-2xl shadow-2xl border border-white/10 w-max">
                
                {/* 1. 工具切换与撤回区域 */}
                <div className="flex items-center gap-1 border-r border-white/10 pr-5 mr-5">
                    <button onClick={() => {setMode('pen'); redrawCanvas();}} title="画笔" className={`p-2 rounded-xl transition-all ${mode === 'pen' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-white'}`}>
                        <Pen size={18} />
                    </button>
                    <button onClick={() => {setMode('eraser'); redrawCanvas();}} title="橡皮擦" className={`p-2 rounded-xl transition-all ${mode === 'eraser' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-white'}`}>
                        <Eraser size={18} />
                    </button>
                    
                    <div className="w-px h-5 bg-white/10 mx-2"></div>
                    
                    <button onClick={handleUndo} disabled={!canUndo} title="撤回" className={`p-2 rounded-xl transition-all ${canUndo ? 'text-neutral-300 hover:bg-white/10 hover:text-white' : 'text-neutral-700 cursor-not-allowed'}`}>
                        <Undo size={18} />
                    </button>
                </div>

                {/* 2. 画笔大小 */}
                <div className="flex items-center gap-3 border-r border-white/10 pr-5 mr-5">
                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-500"></div>
                    <input type="range" min="1" max="100" value={brushSize} onChange={(e) => {setBrushSize(parseInt(e.target.value)); redrawCanvas();}} className="w-32 accent-blue-500 cursor-pointer" />
                    <div className="w-4 h-4 rounded-full bg-neutral-500"></div>
                </div>

                {/* 3. 颜色选择 */}
                <div className={`flex gap-2 border-r border-white/10 pr-5 transition-opacity ${mode === 'eraser' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                    {['#ef4444', '#000000', '#ffffff', '#3b82f6', '#22c55e'].map(c => (
                        <button key={c} onClick={() => {setColor(c); redrawCanvas();}} className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-transparent'} shadow-md transition-all`} style={{ backgroundColor: c }} />
                    ))}
                </div>

                {/* 4. 操作按钮 */}
                <div className="flex gap-3 pl-5">
                    <button onClick={onCancel} className="px-5 py-2 bg-neutral-800 rounded-xl text-sm font-medium text-neutral-300 hover:bg-neutral-700 transition-all">取消</button>
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 bg-blue-600 rounded-xl text-sm text-white font-bold hover:bg-blue-500 transition-all flex items-center gap-2">
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16}/>} 保存原图
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}