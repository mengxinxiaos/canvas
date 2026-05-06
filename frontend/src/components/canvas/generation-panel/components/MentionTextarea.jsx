// 纯 UI 组件：处理自适应输入框与幽灵高亮层
import React, { useRef } from 'react';
import { LinkIcon } from 'lucide-react';
import { useMentionEngine } from '../hooks/useMentionEngine';

// 💡 修复：同时接收 inputPictures 和 inputMedia，彻底避免 undefined 导致功能瘫痪
export default function MentionTextarea({ prompt, setPrompt, mode, inputPictures, inputMedia, onSend }) {
    const textareaRef = useRef(null);
    const backdropRef = useRef(null);

    // 双重保险：不管外层传的是哪个名字，都统一接管
    const finalMedia = inputMedia || inputPictures || [];

    const { 
        mentionState, mentionIndex, filteredMentions, 
        handleInput, insertMention, handleKeyDown 
    } = useMentionEngine(prompt, setPrompt, finalMedia, textareaRef, backdropRef);

    return (
       <div className="px-1 mb-4 relative w-full">
        {/* 幽灵文本高亮层 */}
        <div 
            ref={backdropRef}
            className="absolute inset-0 w-full text-[15px] leading-relaxed whitespace-pre-wrap break-all pointer-events-none overflow-hidden text-transparent p-0 m-0 border-none"
            style={{ minHeight: '48px', fontFamily: 'inherit' }}
        >
            {prompt.split(/(@[图视音]\d+)/g).map((part, i) => 
                /^@[图视音]\d+$/.test(part) ? (
                    <span key={i} className="bg-blue-500/40 rounded-[4px] shadow-[0_0_0_2px_rgba(59,130,246,0.4)] text-transparent">
                        {part}
                    </span>
                ) : <span key={i}>{part}</span>
            )}
        </div>
        
        {/* 真实输入框 */}
        <textarea 
            ref={textareaRef}
            className="no-wheel w-full resize-none outline-none text-[15px] leading-relaxed whitespace-pre-wrap break-all placeholder-neutral-500 bg-transparent text-neutral-200 overflow-y-auto p-0 m-0 border-none relative z-10" 
            placeholder={mode === 'image' ? "描述你想生成的画面 (输入 @ 引用资产)..." : "描述你想生成的视频内容 (输入 @ 引用资产)..."} 
            value={prompt} 
            rows={2}
            style={{ minHeight: '48px', fontFamily: 'inherit' }} 
            onChange={handleInput}      
            onKeyDown={(e) => handleKeyDown(e, onSend)}  
            onPaste={(e) => e.stopPropagation()} 
            onCopy={(e) => e.stopPropagation()}
            onCut={(e) => e.stopPropagation()} 
        />

            {/* @ 联想菜单 */}
            {mentionState.active && filteredMentions.length > 0 && (
                <div className="absolute z-[150] bg-[#2a2a2a] border border-[#444] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
                     style={{ bottom: '100%', left: '8px', marginBottom: '8px', minWidth: '180px' }}
                     onPointerDown={(e) => e.preventDefault()} 
                >
                     <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1f1f1f] border-b border-white/5 flex items-center gap-1.5">
                         <LinkIcon size={10} /> 选择关联资产
                     </div>
                     <div className="max-h-[160px] overflow-y-auto no-wheel">
                         {filteredMentions.map((media, idx) => (
                             <button key={media.id} onClick={() => insertMention(media)}
                                     className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${idx === mentionIndex ? 'bg-blue-500 text-white' : 'text-neutral-300 hover:bg-[#333]'}`}>
                                 
                                 {(media.type === 'video' || media.type === 'video_media') ? (
                                     <video src={media.src} className="w-6 h-6 rounded-md object-cover border border-black/50" preload="metadata" muted playsInline crossOrigin="anonymous" />
                                 ) : media.type === 'audio' ? (
                                     <div className="w-6 h-6 rounded-md border border-black/50 flex items-center justify-center bg-neutral-800 text-[10px]">🎵</div>
                                 ) : (
                                     <img src={media.src} className="w-6 h-6 rounded-md object-cover border border-black/50" crossOrigin="anonymous" />
                                 )}

                                 <span className="text-[13px] font-medium">{media.label}</span>
                             </button>
                         ))}
                     </div>
                </div>
            )}
        </div>
    );
}