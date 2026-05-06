import React, { useState, useEffect, useRef } from 'react';
import { Bold, AlignLeft, AlignCenter, AlignRight, Minus, Plus, Palette, Type, PaintBucket } from 'lucide-react';

export default function TextToolbar({ node, isSelected, isEditingText, actions }) {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const colorPickerRef = useRef(null);
    const textStyle = node.style || { bold: false, bgColor: 'transparent', color: '#e5e5e5', fontSize: 16, align: 'left' };

    useEffect(() => {
        if (!isSelected) setShowColorPicker(false);
    }, [isSelected]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
                setShowColorPicker(false);
            }
        };
        if (showColorPicker) document.addEventListener('pointerdown', handleClickOutside);
        return () => document.removeEventListener('pointerdown', handleClickOutside);
    }, [showColorPicker]);

    const updateTextStyle = (key, val) => {
        actions.updateNodeData(node.id, { style: { ...textStyle, [key]: val } });
    };

    return (
        // 🚀 删掉了 group-hover 相关逻辑，并加入了 pointer-events-none 防误触
        <div className={`no-drag absolute bottom-full left-1/2 -translate-x-1/2 mb-3 flex items-center gap-1.5 bg-[#232323] border border-white/10 text-neutral-300 px-2 py-1.5 rounded-xl transition-all z-30 shadow-2xl origin-bottom whitespace-nowrap 
            ${isSelected || isEditingText ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}>
            
            <div className="flex items-center gap-1 bg-[#1a1a1a] rounded-lg p-0.5 border border-white/5">
                <button onClick={() => updateTextStyle('fontSize', Math.max(12, textStyle.fontSize - 2))} className="w-6 h-6 flex items-center justify-center hover:bg-[#333] rounded-md transition-colors"><Minus size={12}/></button>
                <span className="text-[12px] w-6 text-center font-medium">{textStyle.fontSize}</span>
                <button onClick={() => updateTextStyle('fontSize', Math.min(400, textStyle.fontSize + 2))} className="w-6 h-6 flex items-center justify-center hover:bg-[#333] rounded-md transition-colors"><Plus size={12}/></button>
            </div>
            <div className="w-px h-4 bg-white/10 mx-0.5"></div>

            <button onClick={() => updateTextStyle('bold', !textStyle.bold)} className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${textStyle.bold ? 'bg-white text-black' : 'hover:bg-white/10'}`}><Bold size={14}/></button>
            <div className="w-px h-4 bg-white/10 mx-0.5"></div>

            <div className="flex items-center gap-0.5 bg-[#1a1a1a] rounded-lg p-0.5 border border-white/5">
                <button onClick={() => updateTextStyle('align', 'left')} className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${textStyle.align === 'left' ? 'bg-[#333] text-white' : 'hover:bg-white/10'}`}><AlignLeft size={14}/></button>
                <button onClick={() => updateTextStyle('align', 'center')} className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${textStyle.align === 'center' ? 'bg-[#333] text-white' : 'hover:bg-white/10'}`}><AlignCenter size={14}/></button>
                <button onClick={() => updateTextStyle('align', 'right')} className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${textStyle.align === 'right' ? 'bg-[#333] text-white' : 'hover:bg-white/10'}`}><AlignRight size={14}/></button>
            </div>
            <div className="w-px h-4 bg-white/10 mx-0.5"></div>

            <div className="relative" ref={colorPickerRef}>
                <button onClick={() => setShowColorPicker(!showColorPicker)} className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${showColorPicker ? 'bg-[#333] text-white' : 'hover:bg-white/10'}`} title="颜色与背景">
                    <Palette size={14} />
                </button>

                {showColorPicker && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-[#242424] border border-[#333] rounded-2xl p-4 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-100">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-neutral-400 font-medium flex items-center gap-1.5"><Type size={12}/> 文字</span>
                            <div className="flex items-center gap-1.5">
                                {['#e5e5e5', '#0f172a', '#ef4444', '#f59e0b', '#10b981', '#3b82f6'].map(c => (
                                    <button key={c} onClick={() => updateTextStyle('color', c)} className={`w-5 h-5 rounded-full border-[1.5px] transition-transform hover:scale-110 ${textStyle.color === c ? 'border-white shadow-md scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} title="更改字体颜色" />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-xs text-neutral-400 font-medium flex items-center gap-1.5"><PaintBucket size={12}/> 背景</span>
                            <div className="flex items-center gap-1.5">
                                {['transparent', '#151515', '#f8fafc', '#ef4444', '#f59e0b', '#3b82f6'].map(c => (
                                    <button key={c} onClick={() => updateTextStyle('bgColor', c)} className={`w-5 h-5 rounded-full border-[1.5px] transition-transform hover:scale-110 ${textStyle.bgColor === c ? 'border-white shadow-md scale-110' : 'border-transparent'}`} style={{ backgroundColor: c === 'transparent' ? '#00000000' : c, backgroundImage: c === 'transparent' ? 'radial-gradient(#666 1px, transparent 1px)' : 'none', backgroundSize: '4px 4px' }} title={c === 'transparent' ? '透明背景' : '填充背景色'} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}