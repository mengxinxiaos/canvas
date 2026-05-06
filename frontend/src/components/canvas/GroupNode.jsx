import React, { memo, useState, useRef, useEffect } from 'react';
import { Edit2, Check, X, Palette, LayoutGrid, Share2, Unlink } from 'lucide-react';

const GroupNode = memo(({ node, isSelected, isDragging, onPointerDown, onResizeStart, actions, zoom = 1 }) => {
    // 改名状态
    const [isEditingName, setIsEditingName] = useState(false);
    const [editName, setEditName] = useState(node.content || '区域底板');
    
    // 颜色面板状态
    const [showColorPicker, setShowColorPicker] = useState(false);
    const colorPickerRef = useRef(null);

    // 点击外部关闭颜色面板
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
                setShowColorPicker(false);
            }
        };
        if (showColorPicker) document.addEventListener('pointerdown', handleClickOutside);
        return () => document.removeEventListener('pointerdown', handleClickOutside);
    }, [showColorPicker]);

    // 保存名称
    const handleSaveName = () => {
        const trimmed = editName.trim();
        if (trimmed) {
            actions.updateNodeData(node.id, { content: trimmed });
        } else {
            setEditName(node.content || '区域底板');
        }
        setIsEditingName(false);
    };

    // 预设主题颜色
    const PRESET_COLORS = [
        { bg: 'rgba(59, 130, 246, 0.05)', border: 'rgba(59, 130, 246, 0.3)', text: '#60a5fa' }, // 蓝色 (默认)
        { bg: 'rgba(239, 68, 68, 0.05)', border: 'rgba(239, 68, 68, 0.3)', text: '#f87171' },   // 红色
        { bg: 'rgba(16, 185, 129, 0.05)', border: 'rgba(16, 185, 129, 0.3)', text: '#34d399' }, // 绿色
        { bg: 'rgba(245, 158, 11, 0.05)', border: 'rgba(245, 158, 11, 0.3)', text: '#fbbf24' }, // 琥珀色
        { bg: 'rgba(139, 92, 246, 0.05)', border: 'rgba(139, 92, 246, 0.3)', text: '#a78bfa' }, // 紫色
        { bg: 'rgba(255, 255, 255, 0.02)', border: 'rgba(255, 255, 255, 0.1)', text: '#9ca3af' },// 灰色
    ];

    const currentTheme = node.style?.theme || PRESET_COLORS[0];

    const changeTheme = (theme) => {
        actions.updateNodeData(node.id, { style: { ...node.style, theme } });
        setShowColorPicker(false);
    };

    return (
        <div data-node-id={node.id} 
             onPointerDown={(e) => {
                // 💡 核心优化：按住 Cmd (Mac) 或 Ctrl (Win) 时，事件穿透底板！
                // 这意味着点击事件会落到最底层的 TapnowCanvas 上，从而触发画布的拉框多选逻辑
                if (e.metaKey || e.ctrlKey) {
                    return; 
                }
                // 正常点击则走原来的逻辑（选中/拖拽底板）
                onPointerDown(e, node.id);
            }}
             // z-index 设为 0，确保底板在最下层
             className={`absolute z-0 group rounded-3xl transition-colors duration-200 border-2 ${isSelected ? 'ring-2 ring-blue-500 shadow-2xl' : ''}`}
             style={{ 
                 transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)`, 
                 width: node.size.w, 
                 height: node.size.h, 
                 backgroundColor: currentTheme.bg,
                 borderColor: currentTheme.border,
                 cursor: isDragging ? 'grabbing' : 'grab',
                 willChange: 'transform, width, height'
             }}>
          
          {/* ================= 1. 内部背景标题 (左上角实体区) ================= */}
          <div className="absolute top-4 left-6 pointer-events-auto z-10" onPointerDown={e => e.stopPropagation()}>
              {isEditingName ? (
                  <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
                      <input 
                          type="text" 
                          value={editName} 
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName();
                              if (e.key === 'Escape') { setEditName(node.content || '区域底板'); setIsEditingName(false); }
                          }}
                          autoFocus
                          className="bg-transparent border-none px-2 py-0.5 text-sm text-white outline-none w-32 font-bold"
                      />
                      <button onClick={handleSaveName} className="text-green-500 hover:bg-white/10 p-1 rounded-lg transition-colors"><Check size={14}/></button>
                      <button onClick={() => { setEditName(node.content || '区域底板'); setIsEditingName(false); }} className="text-neutral-400 hover:bg-white/10 p-1 rounded-lg transition-colors"><X size={14}/></button>
                  </div>
              ) : (
                  <div className="flex items-center gap-2 group/title cursor-pointer opacity-50 hover:opacity-100 transition-opacity select-none" 
                       onClick={() => setIsEditingName(true)} title="点击重命名">
                      <span className="font-bold text-xl tracking-wide" style={{ color: currentTheme.text }}>
                          {node.content || '区域底板'}
                      </span>
                      <Edit2 size={14} style={{ color: currentTheme.text }} className="opacity-0 group-hover/title:opacity-100 transition-opacity" />
                  </div>
              )}
          </div>

          {/* ================= 2. 外部悬浮工具栏 (带文字标签的胶囊按钮) ================= */}
          {isSelected && !isDragging && (
              <div className="absolute z-[250] no-drag pointer-events-auto flex items-center bg-[#232323] backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] origin-bottom w-max"
                   style={{
                       left: '50%',
                       top: 0, 
                       transform: `translate(-50%, calc(-100% - ${16 / zoom}px)) scale(${1 / zoom})`,
                       willChange: 'transform'
                   }}
                   onPointerDown={e => e.stopPropagation()} 
              >
                  {/* 布局功能 */}
                  <button 
                      onClick={(e) => actions.onLayoutGroup(e, node.id, 'grid')}
                      className="px-3 py-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"
                      title="将底板内节点排列为宫格"
                  >
                      <LayoutGrid size={16} />
                      <span className="text-xs font-medium">宫格排列</span>
                  </button>
                  <button 
                      onClick={(e) => actions.onLayoutGroup(e, node.id, 'horizontal')}
                      className="px-3 py-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-1.5"
                      title="根据连线关系水平排版"
                  >
                      <Share2 size={16} />
                      <span className="text-xs font-medium">水平排列</span>
                  </button>

                  <div className="w-px h-5 bg-white/10 mx-1"></div>

                  {/* 颜色修改 */}
                  <div className="relative" ref={colorPickerRef}>
                      <button 
                          onClick={() => setShowColorPicker(!showColorPicker)}
                          className={`px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${showColorPicker ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}
                      >
                          <Palette size={16} />
                          <span className="text-xs font-medium">颜色</span>
                      </button>

                      {/* 颜色选择气泡 */}
                      {showColorPicker && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 bg-[#242424] border border-[#333] rounded-xl p-2.5 shadow-2xl flex gap-2 z-[100] animate-in fade-in zoom-in-95 duration-100">
                              {PRESET_COLORS.map((theme, idx) => (
                                  <button 
                                      key={idx} 
                                      onClick={() => changeTheme(theme)}
                                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${currentTheme.bg === theme.bg ? 'scale-110 shadow-md border-white' : 'border-transparent'}`}
                                      style={{ backgroundColor: theme.text }}
                                      title="切换颜色"
                                  />
                              ))}
                          </div>
                      )}
                  </div>

                  <div className="w-px h-5 bg-white/10 mx-1"></div>

                  {/* 解散底板功能 (标红警示) */}
                  <button 
                      onClick={(e) => actions.onUngroup(e, node.id)}
                      className="px-3 py-2 rounded-xl text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center gap-1.5"
                      title="删除该底板，但保留内部的节点"
                  >
                      <Unlink size={16} />
                      <span className="text-xs font-medium">解组</span>
                  </button>
              </div>
          )}

          {/* ================= 3. 自由缩放把手 ================= */}
          <div 
              className="absolute right-0 bottom-0 w-8 h-8 cursor-nwse-resize flex items-center justify-center group-resize-handle z-10"
              onPointerDown={(e) => onResizeStart(e, node, 'resizeGroup')}
              title="自由缩放底板"
          >
              <div className="w-3 h-3 border-r-[3px] border-b-[3px] opacity-30 group-hover:opacity-100 transition-opacity absolute bottom-2 right-2 pointer-events-none" 
                   style={{ borderColor: currentTheme.text }}></div>
          </div>
        </div>
    );
});

export default GroupNode;