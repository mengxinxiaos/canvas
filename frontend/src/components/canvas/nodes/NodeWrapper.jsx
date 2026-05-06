// 🟢 物理外壳 (锚点、包围盒、缩放把手)
import React from 'react';
import { Plus } from 'lucide-react';

export default function NodeWrapper({ 
    node, isSelected, isMultiSelected, isDrawing, isCropping, isEditingText, actions, children 
}) {
    const isText = node.type === 'text';
    const isMedia = ['picture', 'video_media'].includes(node.type);
    const isGen = ['image', 'video'].includes(node.type);
    
    const showResizeHandle = (isMedia || isGen || isText) && !isDrawing && !isCropping && !isMultiSelected;
    return (
        <div data-node-id={node.id} 
             onPointerDown={(e) => actions.onPointerDown(e, node.id)}
             onDoubleClick={(e) => actions.onDoubleClick?.(e, node)}
             className={`absolute group ${(isDrawing || isCropping) ? 'z-50' : 'z-10'}`}
             style={{ 
               transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)`,
               width: node.size.w, 
               height: node.size.h, 
               cursor: isDrawing ? 'crosshair' : (isText && isEditingText ? 'text' : 'grab'),
               willChange: 'transform, width, height',
               transition: 'width 0.3s cubic-bezier(0.25, 1, 0.5, 1), height 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
             }}>
          
          <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center cursor-crosshair z-20 opacity-0 group-hover:opacity-100 transition-opacity"
               onPointerDown={(e) => {e.preventDefault(); e.stopPropagation(); actions.onEdgeStart(e, node.id, 'left')}}>
               <div className="w-5 h-5 bg-neutral-800 text-neutral-400 rounded-full border border-neutral-600 flex items-center justify-center hover:text-white hover:border-white hover:bg-neutral-700 transition-colors shadow-md pointer-events-none"><Plus size={12}/></div>
          </div>

          <div className="absolute right-[-16px] top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center cursor-crosshair z-20 opacity-0 group-hover:opacity-100 transition-opacity"
               onPointerDown={(e) => {e.preventDefault(); e.stopPropagation(); actions.onEdgeStart(e, node.id, 'right')}}>
               <div className="w-5 h-5 bg-neutral-800 text-neutral-400 rounded-full border border-neutral-600 flex items-center justify-center hover:text-white hover:border-white hover:bg-neutral-700 transition-colors shadow-md pointer-events-none"><Plus size={12}/></div>
          </div>

          {children}
         
          {showResizeHandle && (
              <div className={`absolute right-[-8px] bottom-[-8px] w-6 h-6 cursor-se-resize flex items-center justify-center transition-all z-40 bg-blue-500 text-white rounded-full shadow-lg border-2 border-[#151515] hover:scale-110 
                   ${isSelected ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                   onPointerDown={(e) => actions.onResizeStart(e, node, isText ? (isEditingText ? 'resizeFree' : 'resizeTextScale') : 'resizeNode')}
                   title={isText ? (isEditingText ? "自由调整文本框排版" : "等比缩放文字") : "拖拽等比缩放"}>
                  <div className="w-2 h-2 border-r-2 border-b-2 border-white -ml-0.5 -mt-0.5 pointer-events-none"></div>
              </div>
          )}
        </div>
    );
}