import React from 'react';
import { Loader2, ImagePlus, Video } from 'lucide-react';

export default function GenPlaceholder({ node, isSelected }) {
    const isImageGen = node.type === 'image';
    const bgColor = isImageGen ? 'bg-blue-900/10' : 'bg-purple-900/10';
    const textColor = isImageGen ? 'text-blue-400' : 'text-purple-400';
    const iconColor = isImageGen ? 'text-blue-500' : 'text-purple-500';
    const Icon = isImageGen ? ImagePlus : Video;
    const label = isImageGen ? '图像生成区' : '视频渲染区';

    return (
        <div className={`w-full h-full relative rounded-2xl flex flex-col overflow-hidden ${isSelected ? 'ring-2 ring-blue-500 shadow-[0_8px_30px_rgba(0,0,0,0.5)]' : 'shadow-lg ring-1 ring-white/10'}`}
             style={{ backgroundColor: '#151515' }}>
            <div className={`w-full h-full flex items-center justify-center relative ${bgColor}`}>
                 {node._isLoading ? (
                     <div className={`flex flex-col items-center gap-2 ${textColor}`}>
                         <Loader2 className="animate-spin" size={24} />
                         {/* 👇 修改了这里：优先读取动态状态文案，没有则兜底 */}
                         <span className="text-xs font-medium">
                             {node._loadingText || '处理中...'}
                         </span>
                     </div>
                 ) : node._error ? (
                     <div className="text-red-400 text-xs text-center p-4 break-all no-wheel overflow-y-auto">{node._error}</div>
                 ) : (
                     <div className="flex flex-col items-center justify-center text-center p-4 opacity-50 hover:opacity-100 transition-opacity">
                         <Icon className={`${iconColor} mb-2`} size={36}/>
                         <span className={`text-sm font-bold ${textColor}`}>{label}</span>
                     </div>
                 )}
            </div>
        </div>
    );
}