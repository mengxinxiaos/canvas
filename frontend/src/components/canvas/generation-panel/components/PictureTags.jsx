import React, { useState, useMemo } from 'react';
import { LinkIcon, X } from 'lucide-react'; // 👈 记得引入 X 图标
import { MEDIA_TYPES } from '../../../../config/presets';

export default function PictureTags({ pictures, mode, videoRefMode, onReorder, onDelete }) {
    // 拖拽索引状态
    const [draggedIdx, setDraggedIdx] = useState(null);
    
    const picturesWithLabels = useMemo(() => {
        let imgCount = 0;
        let vidCount = 0;
        let audCount = 0;

        return pictures.map(pic => {
            let tagPrefix = '图';
            let num = 0;
            if ([MEDIA_TYPES.VIDEO, MEDIA_TYPES.VIDEO_MEDIA].includes(pic.type)){
                tagPrefix = '视';
                num = ++vidCount;
            } else if (MEDIA_TYPES.AUDIO === pic.type) {
                tagPrefix = '音';
                num = ++audCount;
            } else {
                tagPrefix = '图';
                num = ++imgCount;
            }
            // 将计算好的标签存入对象中供下方渲染使用
            return { ...pic, tagPrefix, displayLabel: `${tagPrefix}${num}` };
        });
    }, [pictures]);

    if (!pictures || pictures.length === 0) return null;

    return (
        <div className="flex items-center gap-3 px-1 mb-4 pb-3 border-b border-white/5">
            <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-neutral-400 bg-[#2a2a2a] shadow-inner shrink-0">
                <LinkIcon size={18} />
            </div>
            
            {/* 隐藏滚动条的样式保留 */}
            <div className="flex gap-2 overflow-x-auto p-1 items-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                
                {/* 🚨 注意：这里循环的是我们上面计算好的 picturesWithLabels */}
                {picturesWithLabels.map((pic, i) => {
                    let rightBottomTag = null;
                    let showTopLeftTag = true; 

                    if (mode === 'video') {
                        if (videoRefMode === 'first_last') {
                            // 注意：这里的首尾逻辑依然依赖全局索引 i，这是正确的，因为首尾是针对总体顺序的
                            rightBottomTag = i === 0 ? '首' : (i === picturesWithLabels.length - 1 ? '尾' : '参');
                            showTopLeftTag = false; 
                        } else {
                            showTopLeftTag = true;
                        }
                    }

                    return (
                        <div 
                            key={pic.id} 
                            className="group relative w-11 h-11 shrink-0 cursor-move transition-transform"
                            draggable
                            onDragStart={(e) => {
                                setDraggedIdx(i);
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', ''); 
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                if (draggedIdx === null || draggedIdx === i) return;
                                
                                // 排序逻辑仍然操作原始 pictures 数组
                                const newPictures = [...pictures];
                                const draggedItem = newPictures.splice(draggedIdx, 1)[0];
                                newPictures.splice(i, 0, draggedItem);
                                
                                setDraggedIdx(i);
                                onReorder(newPictures); 
                            }}
                            onDragEnd={() => setDraggedIdx(null)}
                            style={{ opacity: draggedIdx === i ? 0.4 : 1 }}
                        >
                            
                            <div className="w-full h-full rounded-xl overflow-hidden bg-black shadow-md border border-white/10 group-hover:ring-2 group-hover:ring-blue-500 transition-all relative">
                                {([MEDIA_TYPES.VIDEO, MEDIA_TYPES.VIDEO_MEDIA].includes(pic.type)) ? (
                                    <video src={pic.src} className="w-full h-full object-cover pointer-events-none" preload="metadata" muted playsInline crossOrigin="anonymous" />
                                ) : (MEDIA_TYPES.AUDIO === pic.type) ? (
                                    <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-400 text-xs pointer-events-none">🎵</div>
                                ) : (
                                    <img src={pic.src} className="w-full h-full object-cover pointer-events-none" crossOrigin="anonymous" alt={pic.displayLabel} />
                                )}
                                
                                {rightBottomTag && (
                                    <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[8px] px-1.5 py-0.5 rounded-tl-md font-bold z-10 pointer-events-none"> 
                                        {rightBottomTag} 
                                    </div>
                                )}
                                
                                {/* 💡 核心修复：直接使用刚刚计算好的 displayLabel */}
                                {showTopLeftTag && (
                                    <div className="absolute top-0 left-0 bg-blue-500/90 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded-br-lg font-bold shadow-sm z-10 pointer-events-none">
                                        {pic.displayLabel}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(pic.id);
                                }}
                                className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all z-20 shadow-md scale-90 hover:scale-100"
                            >
                                <X size={10} strokeWidth={3} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}