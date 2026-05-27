import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LinkIcon, X } from 'lucide-react';
import { MEDIA_TYPES } from '../../../../config/presets';

export default function PictureTags({
    pictures,
    mode,
    videoRefMode,
    onReorder,
    onDelete,
    onInsert
}) {
    const [draggedIdx, setDraggedIdx] = useState(null);

    // 拖拽过程中的本地预览顺序。
    // 注意：拖拽过程中不再直接通知父级，避免高频 updateNodeData / TipTap 重绘。
    const [draftPictures, setDraftPictures] = useState(pictures || []);
    const draftPicturesRef = useRef(pictures || []);
    const isDraggingRef = useRef(false);

    const [hoveredAsset, setHoveredAsset] = useState(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        // 非拖拽状态下，父级数据变化时同步本地预览数据。
        // 拖拽中不覆盖本地顺序，否则会打断拖拽预览。
        if (!isDraggingRef.current) {
            setDraftPictures(pictures || []);
            draftPicturesRef.current = pictures || [];
        }
    }, [pictures]);

    const picturesWithLabels = useMemo(() => {
        let imgCount = 0;
        let vidCount = 0;
        let audCount = 0;

        return draftPictures.map(pic => {
            let tagPrefix = '图';
            let num = 0;

            if ([MEDIA_TYPES.VIDEO, MEDIA_TYPES.VIDEO_MEDIA].includes(pic.type)) {
                tagPrefix = '视';
                num = ++vidCount;
            } else if (MEDIA_TYPES.AUDIO === pic.type) {
                tagPrefix = '音';
                num = ++audCount;
            } else {
                tagPrefix = '图';
                num = ++imgCount;
            }

            return {
                ...pic,
                tagPrefix,
                displayLabel: `${tagPrefix}${num}`,
            };
        });
    }, [draftPictures]);

    if (!pictures || pictures.length === 0) return null;

    const commitReorder = () => {
        const nextList = draftPicturesRef.current || [];

        const oldSignature = (pictures || []).map(item => item.id).join('|');
        const nextSignature = nextList.map(item => item.id).join('|');

        // 顺序没变就不提交，避免无效重映射和无效保存。
        if (oldSignature !== nextSignature) {
            onReorder?.(nextList);
        }
    };

    return (
        <>
            <div className="flex items-center gap-3 px-1 mb-4 pb-3 border-b border-white/5">
                <div className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-neutral-400 bg-[#2a2a2a] shadow-inner shrink-0">
                    <LinkIcon size={18} />
                </div>

                <div className="flex gap-2 overflow-x-auto p-1 items-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {picturesWithLabels.map((pic, i) => {
                        let rightBottomTag = null;
                        let showTopLeftTag = true;

                        if (mode === 'video') {
                            if (videoRefMode === 'first_last') {
                                rightBottomTag = i === 0
                                    ? '首'
                                    : (i === picturesWithLabels.length - 1 ? '尾' : '参');

                                showTopLeftTag = false;
                            } else {
                                showTopLeftTag = true;
                            }
                        }

                        return (
                            <div
                                key={pic.id}
                                className="group relative w-11 h-11 shrink-0 cursor-pointer transition-transform"
                                draggable
                                onDragStart={(e) => {
                                    isDraggingRef.current = true;
                                    setDraggedIdx(i);
                                    setHoveredAsset(null);

                                    // 以当前父级顺序作为拖拽起点。
                                    const startList = pictures || [];
                                    setDraftPictures(startList);
                                    draftPicturesRef.current = startList;

                                    e.dataTransfer.effectAllowed = 'move';
                                    e.dataTransfer.setData('text/plain', '');
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();

                                    if (draggedIdx === null || draggedIdx === i) {
                                        return;
                                    }

                                    const currentList = draftPicturesRef.current || [];
                                    const newPictures = [...currentList];

                                    const draggedItem = newPictures.splice(draggedIdx, 1)[0];

                                    if (!draggedItem) return;

                                    newPictures.splice(i, 0, draggedItem);

                                    draftPicturesRef.current = newPictures;
                                    setDraftPictures(newPictures);
                                    setDraggedIdx(i);

                                    // 注意：这里不再调用 onReorder。
                                    // 拖拽过程中只做本地视觉预览。
                                }}
                                onDragEnd={() => {
                                    commitReorder();

                                    isDraggingRef.current = false;
                                    setDraggedIdx(null);
                                }}
                                onClick={() => onInsert?.(pic)}
                                onMouseEnter={(e) => {
                                    if (draggedIdx !== null) return;

                                    setHoveredAsset(pic);
                                    setMousePos({
                                        x: e.clientX,
                                        y: e.clientY,
                                    });
                                }}
                                onMouseMove={(e) => {
                                    setMousePos({
                                        x: e.clientX,
                                        y: e.clientY,
                                    });
                                }}
                                onMouseLeave={() => setHoveredAsset(null)}
                                style={{
                                    opacity: draggedIdx === i ? 0.4 : 1,
                                }}
                            >
                                <div className="w-full h-full rounded-xl overflow-hidden bg-black shadow-md border border-white/10 group-hover:ring-2 group-hover:ring-blue-500 transition-all relative">
                                    {([MEDIA_TYPES.VIDEO, MEDIA_TYPES.VIDEO_MEDIA].includes(pic.type)) ? (
                                        <video
                                            src={pic.src}
                                            className="w-full h-full object-cover pointer-events-none"
                                            preload="metadata"
                                            muted
                                            playsInline
                                            crossOrigin="anonymous"
                                        />
                                    ) : (MEDIA_TYPES.AUDIO === pic.type) ? (
                                        <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-400 text-xs pointer-events-none">
                                            🎵
                                        </div>
                                    ) : (
                                        <img
                                            src={pic.src}
                                            className="w-full h-full object-cover pointer-events-none"
                                            crossOrigin="anonymous"
                                            alt={pic.displayLabel}
                                        />
                                    )}

                                    {rightBottomTag && (
                                        <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[8px] px-1.5 py-0.5 rounded-tl-md font-bold z-10 pointer-events-none">
                                            {rightBottomTag}
                                        </div>
                                    )}

                                    {showTopLeftTag && (
                                        <div className="absolute top-0 left-0 bg-blue-500/90 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded-br-lg font-bold shadow-sm z-10 pointer-events-none">
                                            {pic.displayLabel}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete?.(pic.id);
                                        setHoveredAsset(null);
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

            {hoveredAsset && createPortal(
                <div
                    className="fixed z-[9999] pointer-events-none animate-in fade-in zoom-in-95 duration-100"
                    style={{
                        left: mousePos.x,
                        top: mousePos.y - 15,
                        transform: 'translate(-50%, -100%)',
                    }}
                >
                    <div className="bg-[#1e1e1e]/95 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.6)] flex flex-col items-center">
                        {([MEDIA_TYPES.VIDEO, MEDIA_TYPES.VIDEO_MEDIA].includes(hoveredAsset.type)) ? (
                            <video
                                src={hoveredAsset.src}
                                autoPlay
                                loop
                                muted
                                className="max-w-[180px] max-h-[180px] rounded-xl object-contain bg-black/50 shadow-inner"
                            />
                        ) : (MEDIA_TYPES.AUDIO === hoveredAsset.type) ? (
                            <div className="w-[120px] h-[80px] flex items-center justify-center bg-neutral-900 rounded-xl text-3xl shadow-inner border border-black/30">
                                🎵
                            </div>
                        ) : (
                            <img
                                src={hoveredAsset.src}
                                className="max-w-[180px] max-h-[180px] rounded-xl object-contain bg-black/50 shadow-inner"
                                alt=""
                            />
                        )}

                        <div className="mt-2 text-[11px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-md">
                            {hoveredAsset.displayLabel}
                            <span className="text-neutral-400 font-normal ml-1">
                                · 点击插入到输入框
                            </span>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}