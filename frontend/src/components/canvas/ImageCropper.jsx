import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Loader2, LayoutGrid, Grid3x3 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { mediaService } from '../../services/api';
import { getMediaUrl } from '../../utils/helpers';

export default function ImageCropper({ node, onSave, onSplitSave, onCancel, projectId, zoom }) {
    const src = node.src;
    const [aspect, setAspect] = useState('free');
    const [box, setBox] = useState({ x: 0, y: 0, w: 100, h: 100 }); 
    const [imgLoaded, setImgLoaded] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState(null); 
    const [startPos, setStartPos] = useState({x:0, y:0});
    const [startBox, setStartBox] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const containerRef = useRef(null);
    const imgRef = useRef(null);

    const handleImageLoad = () => {
        setImgLoaded(true);
        setBox({ x: 0, y: 0, w: 100, h: 100 });
    };

    useEffect(() => {
        if (aspect === 'free' || !imgRef.current) return;
        const img = imgRef.current;
        if (!img.naturalWidth || !img.naturalHeight) return;

        // 1. 获取图片真实的宽高比
        const imgRatio = img.naturalWidth / img.naturalHeight;
        
        let targetRatio = 1;
        if (aspect === '16:9') targetRatio = 16/9;
        if (aspect === '9:16') targetRatio = 9/16;
        if (aspect === '21:9') targetRatio = 21/9;

        const percentRatio = targetRatio / imgRatio;

        // 2. 修复点：每次切换比例，直接以 100% 容器为基准计算最大可能面积，告别“无限缩小”
        let newW = 100; 
        let newH = 100 / percentRatio;
        
        if (newH > 100) { 
            newH = 100; 
            newW = 100 * percentRatio; 
        }

        // 3. 完美居中显示
        let newX = (100 - newW) / 2;
        let newY = (100 - newH) / 2;

        setBox({ x: newX, y: newY, w: newW, h: newH });
    }, [aspect]);

    const handlePointerDown = (e, type) => {
        e.stopPropagation(); e.preventDefault();
        setIsDragging(true); setDragType(type); setStartPos({ x: e.clientX, y: e.clientY }); setStartBox({ ...box });
    };

    const handlePointerMove = (e) => {
        if (!isDragging || !containerRef.current) return;
        e.stopPropagation(); e.preventDefault();
        
        const rect = containerRef.current.getBoundingClientRect();
        const dx = (((e.clientX - startPos.x) ) / rect.width) * 100;
        const dy = (((e.clientY - startPos.y) ) / rect.height) * 100;
        
        let newBox = { ...startBox };
        
        if (dragType === 'pan') {
            // 拖拽平移：限制在 0 ~ 100-w/h 之间
            newBox.x = Math.max(0, Math.min(100 - newBox.w, startBox.x + dx));
            newBox.y = Math.max(0, Math.min(100 - newBox.h, startBox.y + dy));
        } else {
            // 1. 处理右边缘和下边缘 (e, s)
            if (dragType.includes('e')) {
                newBox.w = Math.max(5, Math.min(100 - startBox.x, startBox.w + dx));
            }
            if (dragType.includes('s')) {
                newBox.h = Math.max(5, Math.min(100 - startBox.y, startBox.h + dy));
            }
            
            // 2. 处理左边缘和上边缘 (w, n) - 修复溢出时的对侧漂移 Bug
            if (dragType.includes('w')) {
                // 计算实际允许的最大位移：向左最多不能超过 -startBox.x，向右最多保留宽度 5
                const clampedDx = Math.max(-startBox.x, Math.min(startBox.w - 5, dx));
                newBox.x = startBox.x + clampedDx;
                newBox.w = startBox.w - clampedDx;
            }
            if (dragType.includes('n')) {
                // 同理处理 y 轴
                const clampedDy = Math.max(-startBox.y, Math.min(startBox.h - 5, dy));
                newBox.y = startBox.y + clampedDy;
                newBox.h = startBox.h - clampedDy;
            }

            // 3. 处理固定比例 (等比缩放时的边界防溢出与锚定修复)
            if (aspect !== 'free' && imgRef.current) {
                const img = imgRef.current;
                const imgRatio = img.naturalWidth / img.naturalHeight;
                
                let targetRatio = 1;
                if (aspect === '16:9') targetRatio = 16/9; 
                if (aspect === '9:16') targetRatio = 9/16; 
                if (aspect === '21:9') targetRatio = 21/9;

                const percentRatio = targetRatio / imgRatio;

                // 判断拖拽的主要是垂直边还是水平/角落
                const isVerticalDrag = dragType === 'n' || dragType === 's';

                if (isVerticalDrag) {
                    // 纯上下边缘拖拽：以高度推导宽度
                    newBox.w = newBox.h * percentRatio;
                    // 右侧溢出保护
                    if (newBox.x + newBox.w > 100) {
                        newBox.w = 100 - newBox.x;
                        newBox.h = newBox.w / percentRatio;
                        if (dragType === 'n') newBox.y = startBox.y + (startBox.h - newBox.h);
                    }
                } else {
                    // 左右边缘 或 四个角落拖拽：以宽度推导高度
                    newBox.h = newBox.w / percentRatio;

                    // 【致命Bug修复】：如果拖拽的是上方把手(n, nw, ne)，改变了高度，必须基于原来的底边重新反推 y 坐标，否则底边会乱飘！
                    if (dragType.includes('n')) {
                        newBox.y = startBox.y + startBox.h - newBox.h;
                    }

                    // 底部溢出保护
                    if (newBox.y + newBox.h > 100) {
                        newBox.h = 100 - newBox.y;         
                        newBox.w = newBox.h * percentRatio; 
                        if (dragType.includes('w')) {
                            newBox.x = startBox.x + startBox.w - newBox.w;
                        }
                    }
                    
                    // 顶部溢出保护 (y < 0)
                    if (newBox.y < 0) {
                        newBox.y = 0;
                        newBox.h = startBox.y + startBox.h; 
                        newBox.w = newBox.h * percentRatio;
                        if (dragType.includes('w')) {
                            newBox.x = startBox.x + startBox.w - newBox.w;
                        }
                    }
                }
            }
        }
        setBox(newBox);
    };

    const handlePointerUp = (e) => { e.stopPropagation(); setIsDragging(false); };

    const executeCrop = async (e) => {
        e.stopPropagation(); setIsSaving(true);
        const img = imgRef.current; const canvas = document.createElement('canvas');
        const sx = (box.x / 100) * img.naturalWidth; const sy = (box.y / 100) * img.naturalHeight;
        const sWidth = (box.w / 100) * img.naturalWidth; const sHeight = (box.h / 100) * img.naturalHeight;
        canvas.width = sWidth; canvas.height = sHeight;
        canvas.getContext('2d').drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], `crop_${Date.now()}.png`, { type: 'image/png' });
            const res = await mediaService.uploadFile(file, projectId, 'crop');
            const displayWidth = node.size.w; const displayHeight = (sHeight / sWidth) * displayWidth;
            onSave(getMediaUrl(res.url), displayWidth, displayHeight, node.position.x, node.position.y);
        } catch (e) { alert("裁剪失败"); } finally { setIsSaving(false); }
    };

    // 3. 完美复刻的九宫格/四宫格算法
    const executeSplit = async (e, n) => {
        e.stopPropagation(); 
        setIsSaving(true);
        const img = imgRef.current; 
        
        // 提取当前框选区域作为切割母版 (如果没拉框就是全图)
        const sx = (box.x / 100) * img.naturalWidth; 
        const sy = (box.y / 100) * img.naturalHeight;
        let sw = (box.w / 100) * img.naturalWidth; 
        let sh = (box.h / 100) * img.naturalHeight;

        // 步骤 1：自动判断最接近的比例
        const r = sw / sh;
        const targetRatios = [9/16, 16/9, 21/9, 9/21];
        let bestRatio = targetRatios.reduce((prev, curr) => 
            Math.abs(curr - r) < Math.abs(prev - r) ? curr : prev
        );

        // 步骤 2：居中裁切到目标比例
        let cropW = Math.floor(sw);
        let cropH = Math.floor(sh);
        let cropX = sx;
        let cropY = sy;

        if (r > bestRatio) {
            // 太宽：裁宽
            cropW = Math.floor(sh * bestRatio);
            cropX = sx + Math.floor((sw - cropW) / 2);
        } else {
            // 太高：裁高
            cropH = Math.floor(sw / bestRatio);
            cropY = sy + Math.floor((sh - cropH) / 2);
        }

        // 步骤 3：保证宽高能被 n 整除
        cropW = cropW - (cropW % n);
        cropH = cropH - (cropH % n);

        const tileW = cropW / n;
        const tileH = cropH / n;

        try {
            const urls = [];
            // 步骤 4：循环切片并打 ZIP (此处前端改为直接并发上传获得 URL 数组)
            for (let row = 0; row < n; row++) {
                for (let col = 0; col < n; col++) {
                    const canvas = document.createElement('canvas');
                    canvas.width = tileW; 
                    canvas.height = tileH;
                    const ctx = canvas.getContext('2d');
                    
                    const tileX = cropX + col * tileW;
                    const tileY = cropY + row * tileH;
                    
                    ctx.drawImage(img, tileX, tileY, tileW, tileH, 0, 0, tileW, tileH);
                    
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    const file = new File([blob], `split_${n}x${n}_${Date.now()}_${row}_${col}.png`, { type: 'image/png' });
                    const res = await mediaService.uploadFile(file, projectId, 'split');
                    urls.push(getMediaUrl(res.url));
                }
            }
            // 提交回主画布渲染
            onSplitSave(urls, n, n, tileW, tileH);
        } catch (err) {
            alert("切割失败，请检查网络"); 
        } finally {
            setIsSaving(false); 
        }
    };

    return createPortal(
        <div 
            className="fixed inset-0 z-[400] bg-black/95 flex flex-col items-center justify-center p-8 backdrop-blur-md animate-in fade-in no-wheel" 
            onPointerDown={e => e.stopPropagation()} 
            onPointerMove={handlePointerMove} 
            onPointerUp={handlePointerUp} 
            onPointerLeave={handlePointerUp}
        >
            {/* --- 图片区域：限制最大范围并居中 --- */}
            <div className="w-full h-full max-h-[75vh] flex items-center justify-center overflow-hidden rounded-2xl">
                
                {/* 实际用来承载坐标系的内层容器（会紧紧贴合图片实际大小） */}
                <div className="relative inline-flex max-w-full max-h-full" ref={containerRef}>
                    
                    {/* 底图（不使用 object-contain） */}
                    <img 
                        ref={imgRef} 
                        src={src} 
                        className="max-w-full max-h-[75vh] block select-none opacity-30 pointer-events-none" 
                        draggable={false} 
                        crossOrigin="anonymous" 
                        onLoad={handleImageLoad} 
                    />
                    
                    {/* 裁剪高亮框 */}
                    <div 
                        className="absolute border border-blue-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] cursor-move overflow-hidden" 
                        style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }} 
                        onPointerDown={(e) => handlePointerDown(e, 'pan')}
                    >
                        <img 
                            src={src} 
                            className="absolute max-w-none pointer-events-none" 
                            style={{ 
                                width: `${100 / (box.w / 100)}%`, 
                                height: `${100 / (box.h / 100)}%`, 
                                left: `-${(box.x / box.w) * 100}%`, 
                                top: `-${(box.y / box.h) * 100}%` 
                            }} 
                            crossOrigin="anonymous" 
                        />
                        
                        <div className="absolute w-full h-1/3 border-y border-white/30 top-1/3 pointer-events-none"></div>
                        <div className="absolute w-1/3 h-full border-x border-white/30 left-1/3 pointer-events-none"></div>

                        <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-nwse-resize z-10" onPointerDown={(e) => handlePointerDown(e, 'nw')}></div>
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-nesw-resize z-10" onPointerDown={(e) => handlePointerDown(e, 'ne')}></div>
                        <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-nesw-resize z-10" onPointerDown={(e) => handlePointerDown(e, 'sw')}></div>
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-nwse-resize z-10" onPointerDown={(e) => handlePointerDown(e, 'se')}></div>
                    </div>
                </div>
            </div>
            
            {/* --- Toolbar 区域：与图片区域平级，并添加 z-[50] 确保处于最上层 --- */}
            <div className="crop-toolbar absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#222] p-2.5 px-4 rounded-full shadow-2xl border border-white/10 w-max no-drag z-[50]" onPointerDown={e => e.stopPropagation()}>
                
                <div className="flex gap-1.5 border-r border-white/10 pr-4">
                    {['free', '16:9', '9:16', '21:9'].map(r => (
                        <button key={r} onClick={(e) => { e.stopPropagation(); setAspect(r); }} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${aspect === r ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'}`}>{r === 'free' ? '自由' : r}</button>
                    ))}
                </div>
                
                <div className="flex gap-2 border-r border-white/10 pr-4 pl-2">
                    <button onClick={(e) => executeSplit(e, 2)} disabled={isSaving} className={`px-3 py-1.5 rounded-full text-xs font-medium bg-neutral-800 text-amber-400 hover:bg-neutral-700 transition-colors flex items-center gap-1.5`}>
                        <LayoutGrid size={14}/> 2x2 拆分
                    </button>
                    <button onClick={(e) => executeSplit(e, 3)} disabled={isSaving} className={`px-3 py-1.5 rounded-full text-xs font-medium bg-neutral-800 text-amber-400 hover:bg-neutral-700 transition-colors flex items-center gap-1.5`}>
                        <Grid3x3 size={14}/> 3x3 拆分
                    </button>
                </div>

                <div className="flex gap-2 pl-2">
                    <button onClick={(e) => { e.stopPropagation(); onCancel(); }} className="px-4 py-1.5 bg-neutral-800 rounded-full text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white transition-all">取消</button>
                    <button onClick={executeCrop} disabled={isSaving} className="px-5 py-1.5 bg-blue-600 rounded-full text-sm text-white font-medium hover:bg-blue-500 flex items-center gap-2 transition-all">{isSaving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>} 确认</button>
                </div>
            </div>
        </div>,
        document.body
    );
}