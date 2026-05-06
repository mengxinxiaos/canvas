import React, { useEffect, useRef } from 'react';

/**
 * 工业级 Popover 基础组件
 * 包含：点击外部关闭、ESC 关闭、自动聚焦、基础进场动画
 */
export default function Popover({ 
    isOpen, 
    onClose, 
    trigger, 
    children, 
    className = "",
    width = "auto"
}) {
    const popoverRef = useRef(null);
    const triggerRef = useRef(null);

    // 处理全局点击外部关闭 和 键盘 ESC 关闭
    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (e) => {
            // 如果点击的不是触发按钮，也不是弹窗内部，就关闭
            if (
                popoverRef.current && !popoverRef.current.contains(e.target) &&
                triggerRef.current && !triggerRef.current.contains(e.target)
            ) {
                onClose();
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                // 工业级细节：关闭弹窗后，把焦点还给触发它的按钮
                triggerRef.current?.focus(); 
            }
        };

        document.addEventListener('pointerdown', handlePointerDown, true);
        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isOpen, onClose]);

    // 焦点劫持：弹窗打开时，自动聚焦到弹窗内的第一个可交互元素
    useEffect(() => {
        if (isOpen && popoverRef.current) {
            const focusableElements = popoverRef.current.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusableElements.length > 0) {
                // 延迟一帧聚焦，确保 DOM 已经完全渲染
                requestAnimationFrame(() => focusableElements[0].focus());
            }
        }
    }, [isOpen]);

    return (
        <div className="relative inline-block">
            {/* 触发器插槽 */}
            <div ref={triggerRef} onClick={(e) => e.stopPropagation()}>
                {trigger}
            </div>

            {/* 弹窗内容 */}
            {isOpen && (
                <div 
                    ref={popoverRef}
                    className={`absolute z-[200] bottom-full left-0 mb-3 bg-[#242424] border border-[#333] rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-100 origin-bottom-left ${className}`}
                    style={{ width }}
                    // 阻止弹窗内的滚轮事件冒泡到画布底层
                    onWheel={(e) => e.stopPropagation()} 
                >
                    {children}
                </div>
            )}
        </div>
    );
}