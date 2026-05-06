import React from 'react';
import { Wand2, Crop, PenTool, Maximize, Download, FlipHorizontal } from 'lucide-react';

// 🚀 确保在参数里接收 isSelected
export default function MediaToolbar({ node, canRemix, isPicture, hasMediaTools, actions, isSelected }) {
    return (
        // 🚀 修改 className，删掉 group-hover，使用 isSelected 动态判断
        <div className={`no-drag absolute bottom-full left-1/2 -translate-x-1/2 mb-3 flex items-center bg-[#232323] border border-white/10 text-neutral-300 px-1 py-1 rounded-full transition-all z-30 shadow-2xl origin-bottom whitespace-nowrap 
            ${isSelected ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}>
            {canRemix && (
                <button onClick={(e) => actions.onRemix(e, node)} className="p-2 hover:text-white hover:bg-white/10 rounded-full flex items-center gap-1.5 text-xs font-medium tooltip" title="原样复刻(Remix)"><Wand2 size={14} /> 重绘</button>
            )}
            {isPicture && (
                <>
                    {canRemix && <div className="w-px h-4 bg-white/10 mx-1"></div>}
                    <button onClick={(e) => actions.onCropStart(e, node.id)} className="p-2 hover:text-white hover:bg-white/10 rounded-full flex items-center gap-1.5 text-xs font-medium tooltip" title="原位裁剪"><Crop size={14} /> 裁剪</button>
                    <button onClick={(e) => actions.onMirror(e, node.id, node.src)} className="p-2 hover:text-white hover:bg-white/10 rounded-full flex items-center gap-1.5 text-xs font-medium tooltip" title="水平镜像翻转"><FlipHorizontal size={14} /> 镜像</button>
                    <button onClick={(e) => actions.onDrawStart(e, node.id)} className="p-2 hover:text-white hover:bg-white/10 rounded-full flex items-center gap-1.5 text-xs font-medium tooltip" title="画笔涂鸦"><PenTool size={14} /> 涂鸦</button>
                </>
            )}
            {hasMediaTools && (
                <>
                    {(canRemix || isPicture) && <div className="w-px h-4 bg-white/10 mx-1"></div>}
                    <button onClick={(e) => actions.onPreview(e, node)} className="p-2 hover:text-white hover:bg-white/10 rounded-full tooltip" title="全屏预览"><Maximize size={14} /></button>
                    <button onClick={(e) => actions.onDownload(e, node.src, node.type)} className="p-2 hover:text-white hover:bg-white/10 rounded-full tooltip" title="下载到本地"><Download size={14} /></button>
                </>
            )}
        </div>
    );
}