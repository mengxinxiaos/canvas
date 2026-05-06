import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Video, PlayCircle } from 'lucide-react';

const getVideoPosterUrl = (originalUrl) => {
    if (!originalUrl) return '';
    if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) return '';
    return `${originalUrl}?x-oss-process=video/snapshot,t_1000,f_jpg,w_400`;
};

export default function VideoContent({ node, isSelected, zoom }) {
    const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
    
    // 🌟 1. 新增：用于追踪鼠标位置和拖拽状态的 Ref
    const dragRef = useRef({ isDragging: false, startX: 0, startY: 0 });

    const posterSrc = getVideoPosterUrl(node.src);

    useEffect(() => {
        setShouldLoadVideo(false);
    }, [node.src]);

    useEffect(() => {
        if (!isSelected) {
            setShouldLoadVideo(false);
        }
    }, [isSelected]);

    // 🌟 2. 记录按下时的坐标，并重置拖拽状态
    const handlePointerDown = (e) => {
        dragRef.current = {
            isDragging: false,
            startX: e.clientX,
            startY: e.clientY
        };
    };

    // 🌟 3. 计算移动距离，若超过 5 像素则判定为拖拽
    const handlePointerMove = (e) => {
        if (dragRef.current.isDragging) return; // 已经判定为拖拽就不用再算了
        
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
            dragRef.current.isDragging = true;
        }
    };

    // 🌟 4. 拦截点击事件
    const handleClick = (e) => {
        // 如果刚刚发生了拖拽，直接吞掉这个点击事件
        if (dragRef.current.isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // 否则正常播放视频
        if (!shouldLoadVideo) {
            setShouldLoadVideo(true);
        }
    };

    const preventNativeDrag = (e) => {
        e.preventDefault();
    };

    return (
        <div
            className={`w-full h-full relative rounded-2xl flex flex-col overflow-hidden ${
                isSelected
                    ? 'ring-2 ring-blue-500 shadow-[0_8px_30px_rgba(0,0,0,0.5)]'
                    : 'shadow-lg ring-1 ring-white/10'
            }`}
            style={{ backgroundColor: '#151515' }}
        >
            <div 
                className="w-full h-full flex items-center justify-center bg-black relative group"
                // 🌟 5. 绑定新的事件监听器
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onClickCapture={handleClick} 
                onDoubleClick={(e) => {
                    if (shouldLoadVideo) {
                        // 1. 阻止浏览器的默认行为（废掉原生的双击全屏）
                        e.preventDefault(); 
                        
                    }
                }}
            >
                {node._isLoading ? (
                    <div className="flex flex-col items-center gap-2 text-neutral-500">
                        <Loader2 className="animate-spin" size={24} />
                        <span className="text-xs font-medium">{node._loadingText}</span>
                    </div>
                ) : node.src ? (
                    <>
                        {posterSrc && (
                            <img
                                src={posterSrc}
                                alt="Video Thumbnail"
                                draggable={false}
                                onDragStart={preventNativeDrag}
                                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
                                    shouldLoadVideo ? 'opacity-0 pointer-events-none' : 'opacity-100'
                                }`}
                                crossOrigin="anonymous"
                            />
                        )}

                        {!shouldLoadVideo && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                                <div className="bg-black/40 rounded-full p-3 backdrop-blur-md border border-white/10 shadow-xl">
                                    <PlayCircle className="text-white/90" size={32} strokeWidth={1.5} />
                                </div>
                            </div>
                        )}

                        {shouldLoadVideo && (
                            <video
                                src={node.src}
                                poster={posterSrc}
                                draggable={false}
                                onDragStart={preventNativeDrag}
                                controls
                                autoPlay
                                preload="metadata"
                                disablePictureInPicture
                                controlsList="nodownload noplaybackrate nofullscreen"
                                className="w-full h-full object-contain relative z-20 animate-in fade-in duration-500"
                                crossOrigin="anonymous"
                                
                            />
                        )}
                    </>
                ) : (
                    <Video className="text-neutral-700" size={32} />
                )}
            </div>
        </div>
    );
}