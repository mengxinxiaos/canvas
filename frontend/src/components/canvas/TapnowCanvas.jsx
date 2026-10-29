import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Type, Cpu, Box, ZoomIn, ZoomOut, Maximize, Loader2, ArrowLeft, Edit2, Check, X, Share2, Video, PenTool, BookOpen, Map as MapIcon, Download,Plus,Bell } from 'lucide-react';
import { shareService } from '../../services/api';
import { GRID_SIZE, EDGE_DERIVATION_OPTIONS, CHANGELOG_DATA, TYPE_COLORS, TYPE_LABELS } from '../../config/constants';
import Toast from '../common/Toast';
import GenerationPanel from './generation-panel/GenerationPanel';
import GlobalDoodleBoard from './GlobalDoodleBoard';
import CanvasMinimap from './CanvasMinimap';

import Edge from './Edge';
import RegularNode from './nodes/RegularNode';
import GroupNode from './GroupNode';

import { generateId } from '../../utils/helpers';

// --- 状态与引擎 (Hooks) ---
import useCanvasStore from '../../store/useCanvasStore';
import { useCanvasSync } from '../../hooks/sync/useCanvasSync';
import { useYjsSandbox } from '../../hooks/sync/useYjsSandbox';
import { useProjectData } from '../../hooks/sync/useProjectData';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { useCanvasHotkeys } from '../../hooks/useCanvasHotkeys';
import { useNodeOperations } from '../../hooks/useNodeOperations';
import { useCanvasThumbnail } from '../../hooks/useCanvasThumbnail';
//agent相关

import {
    CanvasAgentWidget,
    useAgentCanvasActionExecutor,
    useCanvasAgentController,
} from '../../agent';

export default function TapnowCanvas({ user, projectId, onBack }) {
  
  //更新日志相关
  const [showUpdates, setShowUpdates] = useState(false);
  const [hasUnreadUpdates, setHasUnreadUpdates] = useState(true);
  // ================= 1. 全局与本地 UI 状态 =================
  const { viewport, nodes, edges, name, selection, updateViewport, setSelection, pushHistory } = useCanvasStore();

  const [contextMenu, setContextMenu] = useState(null); 
  const [drawingNodeId, setDrawingNodeId] = useState(null); 
  const [croppingNodeId, setCroppingNodeId] = useState(null); 
  const [visiblePrompts, setVisiblePrompts] = useState({}); 
  const [edgeMenu, setEdgeMenu] = useState(null);
  const [toast, setToast] = useState(null); 
  const [previewMedia, setPreviewMedia] = useState(null); 
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [isGlobalDoodling, setIsGlobalDoodling] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);

  const containerRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  // 💡 新增：用于限制光标同步频率的定时器
  const cursorSyncTimeoutRef = useRef(0);
  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);

  const screenToCanvas = useCallback((sx, sy) => {
      const vp = useCanvasStore.getState().viewport;
      return { x: (sx - vp.x) / vp.zoom, y: (sy - vp.y) / vp.zoom };
  }, []);

  const shareToken = useMemo(() => {
      return new URLSearchParams(window.location.search).get('shareToken');
  }, []);

  // ================= 2. 挂载各大业务引擎 =================
  
  // 📦 核心沙箱：为当前画布生成独立的 Yjs 实例
  const yjsInstances = useYjsSandbox(projectId);
  
  // 🔌 协同引擎 (纯 WebSocket & 光标同步)
  const { others, updateMyCursor, removeMyCursor, syncStatus } = useCanvasSync(
      projectId, user, showToast, yjsInstances
  );

  // 💾 数据引擎 (负责项目拉取、防抖保存、数据合并分发)
  const { isFirstLoad, isSaving, dispatchAndSave, updateNodeStrictAndSave, saveToCloud } = useProjectData(
      projectId, showToast, yjsInstances, shareToken
  );
  // 🖱️ 交互引擎 (负责画布拖拽、缩放、框选)
  const { dragState, setDragState, handleCanvasPointerDown } = useCanvasInteraction({
      containerRef, canvasWrapperRef, screenToCanvas, dispatchAndSave, saveToCloud, setEdgeMenu, setContextMenu
  });

  // ⌨️ 快捷键与文件引擎 (负责上传、粘贴、撤销重做)
  const { handleUploadFiles } = useCanvasHotkeys({
      projectId, dispatchAndSave, updateNodeStrictAndSave, saveToCloud, setSelection, 
      setDrawingNodeId, setEdgeMenu, setPreviewMedia, setCroppingNodeId, setContextMenu
  });

  // 📸 缩略图引擎 (负责退出时静默截图并保存)
  const { isGeneratingThumb, generateAndSaveThumbnail } = useCanvasThumbnail(projectId, containerRef);

  //agent相关引擎
    const { executeAgentAction } = useAgentCanvasActionExecutor({
        dispatchAndSave,
        updateNodeStrictAndSave,
        pushHistory,
        setSelection,
        screenToCanvas,
        showToast,

        nodes,
        selection,
    });

  const agentController = useCanvasAgentController({
      user,
      projectId,
      projectName: name,
      nodes,
      edges,
      selection,
      executeAgentAction,
      shareToken,
  });

  // 🛠️ 节点操作引擎 (负责创建节点、AI生成、打组等)
  const { handleGroupSelection, handleBatchDownload, createNode, handleCreateFromEdge, handleGenerate, nodeActions } = useNodeOperations({
      projectId, shareToken, containerRef, canvasWrapperRef,screenToCanvas, dispatchAndSave, updateNodeStrictAndSave, showToast,
      setSelection, setContextMenu, setEdgeMenu, setPreviewMedia, setVisiblePrompts, drawingNodeId, croppingNodeId,
      setCroppingNodeId, setDrawingNodeId, setDragState, dragState,
      isPickingCanvasImages: agentController.isPickingCanvasImages,
      addCanvasImageAttachment: agentController.addCanvasImageAttachment,
  });

  // ================= 3. 画布事件监听与衍生状态 =================
  // 用于绕过 React 渲染的高速本地缓存
  const viewportRef = useRef(viewport);
  const syncTimeoutRef = useRef(null);
  // 当通过 UI 按钮（如“复原100%”）改变 viewport 时，保持 DOM 同步
  useEffect(() => {
      viewportRef.current = viewport;
      if (canvasWrapperRef.current) {
          canvasWrapperRef.current.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
      }
  }, [viewport]);

  // 🚀 滚轮缩放与平移 (工业级 120fps 终极满血版)
  useEffect(() => {
    let rafId = null;       // 帧锁：防止同一帧内重复计算
    let cachedRect = null;  // 布局缓存：彻底消灭 Layout Thrashing 性能黑洞

    const handleWheel = (e) => {
      if (e.target.closest('.no-wheel')) return;
      
      // 拦截浏览器原生缩放行为
      e.preventDefault(); 
      e.stopPropagation();

      // 如果当前已经有一个未执行的动画帧，直接丢弃这次事件（极速锁帧机制）
      if (rafId) return;

      // 在一次连贯的滚动/缩放中，只计算一次容器位置，后续全部复用缓存！
      if (!cachedRect && containerRef.current) {
          cachedRect = containerRef.current.getBoundingClientRect();
      }

      rafId = requestAnimationFrame(() => {
          let { x, y, zoom } = viewportRef.current;

          if (e.ctrlKey || e.metaKey) {
            // 缩放逻辑
            const delta = -e.deltaY * 0.002;
            const newZoom = Math.min(Math.max(0.25, zoom * Math.exp(delta)), 5);
            
            // 💡 核心优化：直接使用 cachedRect，再也不去惊动浏览器重新排版了！
            const mouseX = e.clientX - cachedRect.left; 
            const mouseY = e.clientY - cachedRect.top;

            x = mouseX - (mouseX - x) * (newZoom / zoom);
            y = mouseY - (mouseY - y) * (newZoom / zoom);
            zoom = newZoom;
          } else {
            // 平移逻辑
            x -= e.deltaX;
            y -= e.deltaY;
          }

          // 1. 更新本地高速缓存
          viewportRef.current = { x, y, zoom };

          // 2. 物理操作 DOM
          if (canvasWrapperRef.current) {
              canvasWrapperRef.current.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
          }

          // 3. 防抖同步 React 状态
          if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = setTimeout(() => {
              updateViewport(viewportRef.current);
              // 滚动彻底停止后，清空布局缓存，防止后续窗口改变大小导致坐标错乱
              cachedRect = null; 
          }, 150);

          // 4. 当前帧计算完毕，解锁！允许下一个滚轮事件进入
          rafId = null; 
      });
    };

    const container = containerRef.current || window;
    // passive: false 是为了允许 preventDefault 生效
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    
    return () => {
        container.removeEventListener('wheel', handleWheel, { capture: true });
        if (rafId) cancelAnimationFrame(rafId);
    };
  }, [updateViewport]);

  // 计算当前选中的节点及其 Bounding Box（用于多选工具栏）
  const activeNodes = useMemo(() => nodes.filter(n => selection.includes(n.id)), [selection, nodes]);
  const activeBBox = useMemo(() => {
      if (activeNodes.length < 2) return null; 
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      activeNodes.forEach(n => {
          minX = Math.min(minX, n.position.x);
          minY = Math.min(minY, n.position.y);
          maxX = Math.max(maxX, n.position.x + n.size.w);
          maxY = Math.max(maxY, n.position.y + n.size.h);
      });
      return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [activeNodes]);
  // 视口剔除 (Viewport Culling)
  // 计算当前屏幕在虚拟画布上的真实坐标范围，并过滤出可见节点
  const visibleNodes = useMemo(() => {
      // 1. 获取屏幕视口物理尺寸（考虑容错，如果没有挂载则默认一个大屏幕）
      const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
      const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;

      // 2. 设定缓冲区（Buffer）。
      // 为什么需要缓冲区？为了在用户拖拽时，屏幕边缘的图片已经提前渲染好，防止出现“闪烁出现的白块”。
      // 这里的 800 代表在屏幕视野外 800 像素内的节点也会被渲染。
      const BUFFER = 800; 

      // 3. 计算当前视口在世界坐标系下的 Bounding Box
      const minX = (-viewport.x) / viewport.zoom - BUFFER;
      const minY = (-viewport.y) / viewport.zoom - BUFFER;
      const maxX = (screenW - viewport.x) / viewport.zoom + BUFFER;
      const maxY = (screenH - viewport.y) / viewport.zoom + BUFFER;

      // 4. 剔除算法：只保留与视口有交集的节点
      return nodes.filter(node => {
          // 底板（Group）比较特殊，通常很大且作为背景，我们选择始终渲染它，或者使用更宽松的包围盒
          if (node.type === 'group') return true; 

          // 核心碰撞检测：节点的右边缘在视口左边缘之右，且节点左边缘在视口右边缘之左...以此类推
          return (
              node.position.x < maxX && 
              (node.position.x + node.size.w) > minX && 
              node.position.y < maxY && 
              (node.position.y + node.size.h) > minY
          );
      });
  }, [nodes, viewport.x, viewport.y, viewport.zoom]); // 依赖项：当节点数据或视口发生变化时重新计算
  const nodeMap = useMemo(() => {
      return new Map(nodes.map(n => [n.id, n]));
  }, [nodes]);
  // 连线剔除逻辑 (只有当连线的两端至少有一端可见时，才渲染这条线)
  const visibleEdges = useMemo(() => {
      const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
      return edges.filter(edge => {
          return visibleNodeIds.has(edge.from) || visibleNodeIds.has(edge.to);
      });
  }, [edges, visibleNodes]);
  // ================= 4. 视图渲染 =================

  if (isFirstLoad) return <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]"><Loader2 className="animate-spin text-blue-500" /></div>;

  return (
    <div className="w-full h-full overflow-hidden relative bg-[#0a0a0a]" 
         onPointerDown={handleCanvasPointerDown} 
         onPointerMove={(e) => {
             //if (dragState) return;
             const now = performance.now();
             // 💡 优化：每 50ms 才同步一次自己的光标，杜绝每秒 120 次的 WebSocket 轰炸
             if (now - cursorSyncTimeoutRef.current > 50) {
                 const rect = containerRef.current.getBoundingClientRect();
                 const canvasPos = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
                 updateMyCursor(canvasPos.x, canvasPos.y);
                 cursorSyncTimeoutRef.current = now;
             }
         }}
         onPointerLeave={removeMyCursor}
         onDoubleClick={(e) => { 
             if (e.target.closest('[data-node-id]') || e.target.closest('.no-drag')) {
                 return;
             }
             e.preventDefault();
             const rect = containerRef.current.getBoundingClientRect(); 
             const canvasPos = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top);
             setContextMenu({ x: e.clientX, y: e.clientY, cx: canvasPos.x, cy: canvasPos.y }); 
         }}
         onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
         onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length > 0) handleUploadFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/')), screenToCanvas(e.clientX - containerRef.current.getBoundingClientRect().left, e.clientY - containerRef.current.getBoundingClientRect().top)); }}
         ref={containerRef}>
      
      {/* 🟢 顶部工具栏 🟢 */}
      <div className="absolute top-4 left-4 right-4 z-[100] flex justify-between items-center pointer-events-none">
          {/* 左侧区域 */}
          <div className="flex gap-2 bg-neutral-900/80 backdrop-blur-md p-2 rounded-xl shadow-sm border border-neutral-800 pointer-events-auto items-center text-neutral-300">
            <button 
                onClick={() => generateAndSaveThumbnail(onBack)} 
                disabled={isGeneratingThumb}
                className="p-2 hover:bg-neutral-800 hover:text-white rounded-lg tooltip disabled:opacity-50 transition-opacity" 
                title="返回项目列表"
            >
                {isGeneratingThumb ? <Loader2 size={18} className="animate-spin text-blue-500"/> : <ArrowLeft size={18}/>}
            </button>
            
            <div className="w-px bg-neutral-800 h-4 mx-1"></div>
            {isEditingName ? (
                <div className="flex items-center gap-1 mx-2">
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const trimmed = editName.trim(); if (trimmed && trimmed !== name) { dispatchAndSave({ name: trimmed }); showToast('项目已重命名'); } setIsEditingName(false); } if (e.key === 'Escape') setIsEditingName(false); }} autoFocus className="w-32 bg-neutral-900 border border-blue-500 rounded px-2 py-1 text-white text-sm outline-none focus:ring-2 transition-all no-wheel" />
                    <button onClick={() => { const trimmed = editName.trim(); if (trimmed && trimmed !== name) { dispatchAndSave({ name: trimmed }); showToast('项目已重命名'); } setIsEditingName(false); }} className="text-green-500 hover:bg-neutral-800 p-1.5 rounded"><Check size={14}/></button>
                    <button onClick={() => setIsEditingName(false)} className="text-neutral-500 hover:bg-neutral-800 p-1.5 rounded"><X size={14}/></button>
                </div>
            ) : (
                <div onClick={() => {setEditName(name); setIsEditingName(true);}} className="flex items-center gap-2 group cursor-pointer px-3 py-1.5 hover:bg-neutral-800 rounded-lg mx-1" title="点击重命名">
                    <span className="font-bold text-sm text-white max-w-[120px] truncate">{name}</span>
                    <Edit2 size={12} className="text-neutral-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            )}
            <div className="w-px bg-neutral-800 h-4 mx-1"></div>
            <button onClick={() => createNode('text', screenToCanvas(100, 100))} className="p-2 hover:bg-neutral-800 hover:text-white rounded-lg flex items-center gap-2"><Type size={18}/>文本</button>
            <button onClick={() => createNode('image', screenToCanvas(150, 150))} className="p-2 hover:bg-neutral-800 hover:text-white rounded-lg flex items-center gap-2 text-blue-400 font-medium"><Cpu size={18}/>生图</button>
            <button onClick={() => createNode('video', screenToCanvas(200, 200))} className="p-2 hover:bg-neutral-800 hover:text-white rounded-lg flex items-center gap-2 text-purple-400 font-medium"><Cpu size={18}/>视频</button>
            
            <div className="w-px bg-neutral-800 h-4 mx-1"></div>
            <button onClick={() => setIsGlobalDoodling(true)} className="p-2 hover:bg-neutral-800 hover:text-white rounded-lg flex items-center gap-2 text-pink-400 font-medium tooltip" title="在画布最顶层自由绘画"><PenTool size={18}/>标注</button>

            <div className="w-px bg-neutral-800 h-4 mx-1"></div>
            <button onClick={() => createNode('group', screenToCanvas(50, 50))} className="p-2 hover:bg-neutral-800 hover:text-white rounded-lg flex items-center gap-2 text-amber-500 font-medium tooltip" title="创建区域底板"><Box size={18}/>底板</button>
          </div>
          
          {/* 右侧区域 */}
          <div className="flex gap-2 pointer-events-auto items-center">
            {isSaving && <span className="text-xs text-neutral-500 flex items-center mr-2"><Loader2 size={12} className="animate-spin mr-1"/> 同步至本地...</span>}
            
            {/* 实时的协同状态指示灯*/}
            <div 
                className="bg-neutral-900/80 backdrop-blur-md border border-neutral-800 px-3 py-2.5 rounded-xl shadow-sm flex items-center gap-2 mr-1"
                title={syncStatus === 'connected' ? "协同引擎运行正常" : "与协同服务器断开连接"}
            >
                <div className={`w-2.5 h-2.5 rounded-full ${
                    syncStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 
                    syncStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
                    'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                }`} />
                <span className="text-xs font-medium text-neutral-300 min-w-[36px]">
                    {syncStatus === 'connected' ? '已连接' : 
                    syncStatus === 'connecting' ? '连接中' : '已断线'}
                </span>
            </div>

            {/* 👇 1. 新增的更新日志按钮与弹出面板 👇 */}
            <div className="relative">
                <button 
                    onClick={() => { 
                        setShowUpdates(!showUpdates); 
                        if (hasUnreadUpdates) setHasUnreadUpdates(false); 
                    }}
                    className={`relative p-2.5 rounded-xl flex items-center justify-center transition-all border ${
                        showUpdates 
                        ? 'bg-neutral-800 border-neutral-600 text-white shadow-inner' 
                        : 'bg-neutral-900/80 backdrop-blur-md hover:bg-neutral-800 text-neutral-300 hover:text-white border-neutral-800 shadow-sm'
                    }`}
                    title="更新日志"
                >
                    <Bell size={18} className={hasUnreadUpdates ? "animate-[swing_2s_ease-in-out_infinite]" : ""} />
                    
                    {/* 呼吸灯红点 */}
                    {hasUnreadUpdates && (
                        <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-neutral-900 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
                    )}
                </button>

                {/* 更新日志面板 (工业级弹窗) */}
                {showUpdates && (
                    <div className="absolute top-full right-0 mt-3 w-[340px] bg-[#1a1a1a]/95 backdrop-blur-2xl border border-neutral-700/60 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.5)] overflow-hidden z-[400] origin-top-right animate-in fade-in zoom-in-95 duration-200">
                        {/* 头部 */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/80 bg-neutral-900/50">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-[15px] text-neutral-100 tracking-wide">最新更新</span>
                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    {CHANGELOG_DATA[0].version}
                                </span>
                            </div>
                            <button onClick={() => setShowUpdates(false)} className="text-neutral-500 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1 rounded-md">
                                <X size={14}/>
                            </button>
                        </div>

                        {/* 内容滚动区 */}
                        <div className="max-h-[420px] overflow-y-auto no-scrollbar p-3 space-y-1">
                            {CHANGELOG_DATA.map((log, index) => (
                                <div key={log.version} className="relative pl-6 py-3 group">
                                    {/* 时间轴连线 (最后一条不显示) */}
                                    {index !== CHANGELOG_DATA.length - 1 && (
                                        <div className="absolute left-[11px] top-8 bottom-[-16px] w-[1.5px] bg-neutral-800" />
                                    )}
                                    {/* 时间轴点 */}
                                    <div className={`absolute left-2 top-4 w-1.5 h-1.5 rounded-full ring-4 ring-[#1a1a1a] ${index === 0 ? 'bg-blue-500 ring-blue-500/20' : 'bg-neutral-600'}`} />

                                    {/* 内容区块 */}
                                    <div className="bg-transparent hover:bg-white/5 p-3 rounded-xl transition-colors duration-200">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm text-neutral-200">{log.title}</span>
                                                <span className="text-[11px] text-neutral-500 font-mono mt-0.5">{log.date}</span>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] border font-medium whitespace-nowrap ${TYPE_COLORS[log.type]}`}>
                                                {TYPE_LABELS[log.type]}
                                            </span>
                                        </div>
                                        <ul className="space-y-1.5 mt-2">
                                            {log.items.map((item, i) => (
                                                <li key={i} className="text-[12px] text-neutral-400 leading-relaxed flex items-start">
                                                    <span className="mr-1.5 text-neutral-600 select-none">•</span>
                                                    <span className="flex-1">{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {/* 👆 更新日志功能结束 👆 */}

            <button 
                onClick={() => window.open('https://my.feishu.cn/wiki/OmrewXEDGix6eJkJNvDc4RCunUf?from=from_copylink', '_blank')} 
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all font-medium text-sm border border-neutral-700"
                title="查看使用教程"
            >
                <BookOpen size={16} /> 教程
            </button>
            <button onClick={async () => {
                try {
                    const res = await shareService.createShare(projectId, 'edit');
                    const url = new URL(window.location.origin); url.searchParams.set('shareToken', res.token); url.searchParams.set('projectId', projectId);
                    const linkToCopy = url.toString();
                    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(linkToCopy); } 
                    else { const textArea = document.createElement("textarea"); textArea.value = linkToCopy; textArea.style.position = "fixed"; textArea.style.left = "-999999px"; textArea.style.top = "-999999px"; document.body.appendChild(textArea); textArea.focus(); textArea.select(); document.execCommand('copy'); document.body.removeChild(textArea); }
                    showToast('分享链接已复制');
                } catch(e) { showToast('生成或复制链接失败'); }
            }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg transition-all font-medium text-sm">
                <Share2 size={16} /> 分享
            </button>
          </div>
      </div>

      {/* 🟢 左下角：地图与缩放控制台 (移出顶部栏，并添加防拖拽拦截) 🟢 */}
      <div className="absolute bottom-6 left-6 z-[100] flex flex-col gap-2 pointer-events-none no-drag" onPointerDown={e => e.stopPropagation()}>
          {showMinimap && (
              <div className="pointer-events-auto origin-bottom-left animate-in fade-in zoom-in-95 duration-200">
                  <CanvasMinimap nodes={nodes} viewport={viewport} updateViewport={updateViewport} />
              </div>
          )}
          
          <div className="flex items-center gap-3 bg-[#1e1e1e]/95 backdrop-blur-md px-3 py-2 rounded-2xl border border-neutral-700/60 shadow-2xl pointer-events-auto h-12">
              <button onClick={() => setShowMinimap(!showMinimap)} className={`p-1.5 rounded-lg transition-all ${showMinimap ? 'bg-neutral-700 text-white shadow-inner' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`} title="开关小地图"><MapIcon size={18} /></button>
              <button onClick={() => updateViewport({x:0, y:0, zoom:1})} className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors" title="复原缩放比例"><Maximize size={18} /></button>
              <div className="w-px h-5 bg-neutral-700 mx-1" />
              <div className="flex items-center gap-2 group w-40">
                  <span className="text-xs font-mono font-medium text-neutral-400 w-11 text-right select-none">{Math.round(viewport.zoom * 100)}%</span>
                  <input type="range" min="25" max="500" value={Math.round(viewport.zoom * 100)} onChange={(e) => updateViewport(vp => ({...vp, zoom: Number(e.target.value) / 100}))} className="w-full h-1.5 bg-neutral-700 rounded-full appearance-none cursor-pointer outline-none no-wheel" style={{ background: `linear-gradient(to right, #3b82f6 ${(viewport.zoom * 100 - 5) / (500 - 5) * 100}%, #404040 ${(viewport.zoom * 100 - 5) / (500 - 5) * 100}%)` }} />
              </div>
          </div>
      </div>

      {/* 🟢 框选高亮盒子 🟢 */}
      <div id="fast-selection-box" className="absolute bg-blue-500/20 border border-blue-400 pointer-events-none z-[60] rounded-sm hidden" style={{ willChange: 'transform, width, height' }} />
       
      
      {/* 🟢 主画布渲染层 🟢 */}
     <div className={`absolute inset-0 origin-top-left ${dragState ? 'canvas-dragging' : ''}`} 
           style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, willChange: 'transform' }} 
           ref={canvasWrapperRef}>
        <style>{`
        
            /* 1. 原有的：拖拽时隐藏透明热区 */
            .canvas-dragging g[data-edge-id] path[stroke="transparent"] {
                display: none;
            }
            
            /* 2. 原有的：强制关闭虚线 */
            .canvas-dragging g[data-edge-id] path {
                stroke-dasharray: none !important;
                shape-rendering: optimizeSpeed !important; 
            }

            /* 3. 新增的终极杀手锏：拖拽/缩放时，强制关闭所有阴影和模糊效果！ 👇 */
            .canvas-dragging [data-node-id], 
            .canvas-dragging .floating-toolbar {
                /* 关闭所有高斯模糊和毛玻璃背景 */
                filter: none !important;
                backdrop-filter: none !important;
                /* 关闭所有阴影计算 */
                box-shadow: none !important;
                /* 避免浏览器对复杂图形进行抗锯齿计算 */
                image-rendering: pixelated !important;
            }
           /* 4.拖拽/缩放时，瞬间隐藏所有浮动面板、衍生菜单等 UI 控件 */
            .canvas-dragging [data-panel-for], 
            .canvas-dragging .floating-toolbar, 
            .canvas-dragging #fast-selection-box {
                opacity: 0 !important;
                pointer-events: none !important;
                /* 加一个极短的过渡让消失不那么生硬（可选） */
                transition: opacity 0.1s ease-out; 
            }
        `}</style>

        {/* 底板层 */}
        {nodes.filter(n => n.type === 'group').map(node => (
            <GroupNode 
                key={node.id} 
                node={node} 
                isSelected={selection.includes(node.id)} 
                isDragging={dragState?.type === 'node' && selection.includes(node.id)} 
                onPointerDown={nodeActions.onPointerDown} 
                onResizeStart={nodeActions.onResizeStart} 
                actions={nodeActions} 
                zoom={viewport.zoom}
            />
        ))}
         
         
        {/* 连线层 */}
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-0">
            
          {visibleEdges.map(edge => (
             <Edge 
                 key={edge.id} 
                 edge={edge} 
                 fromNode={nodeMap.get(edge.from)} // 🚀 性能飞跃：瞬间获取，不再遍历
                 toNode={nodeMap.get(edge.to)}     // 🚀 性能飞跃：瞬间获取，不再遍历
                 isSelected={selection.includes(edge.id)} 
                 onPointerDown={(e, id) => { e.stopPropagation(); setSelection([id]); }} 
             />
          ))}
          <path id="fast-drawing-edge" fill="none" stroke="#3b82f6" strokeWidth={2} vectorEffect="non-scaling-stroke" className="hidden" />
          {/* 当衍生菜单打开时，保持半透明实线可见 */}
          {edgeMenu && (
              edgeMenu.fromNodeIds ? 
              // 渲染批量连线
              edgeMenu.fromNodeIds.map(id => {
                  const node = nodes.find(n => n.id === id);
                  if (!node) return null;
                  const x1 = node.position.x + node.size.w;
                  const y1 = node.position.y + node.size.h / 2;
                  const x2 = edgeMenu.cx;
                  const y2 = edgeMenu.cy;
                  const ctrlOffset = Math.max(50, Math.abs(x2 - x1) * 0.4);
                  return <path key={`ghost-${id}`} d={`M ${x1} ${y1} C ${x1 + ctrlOffset} ${y1}, ${x2 - ctrlOffset} ${y2}, ${x2} ${y2}`} fill="none" stroke="#3b82f6" strokeWidth={2} vectorEffect="non-scaling-stroke" opacity="0.6" />;
              }) : 
              // 渲染单根线
              (() => {
                  const node = nodes.find(n => n.id === edgeMenu.fromNodeId);
                  if (!node) return null;
                  const x1 = edgeMenu.anchor === 'right' ? node.position.x + node.size.w : edgeMenu.cx;
                  const y1 = edgeMenu.anchor === 'right' ? node.position.y + node.size.h / 2 : edgeMenu.cy;
                  const x2 = edgeMenu.anchor === 'right' ? edgeMenu.cx : node.position.x;
                  const y2 = edgeMenu.anchor === 'right' ? edgeMenu.cy : node.position.y + node.size.h / 2;
                  const ctrlOffset = Math.max(50, Math.abs(x2 - x1) * 0.4);
                  return <path d={`M ${x1} ${y1} C ${x1 + ctrlOffset} ${y1}, ${x2 - ctrlOffset} ${y2}, ${x2} ${y2}`} fill="none" stroke="#3b82f6" strokeWidth={2} vectorEffect="non-scaling-stroke" opacity="0.6" />;
              })()
          )}
        </svg>
        
       {/* 多选节点时的可视包围盒 */}
       {activeBBox && activeNodes.length > 1 && (
            <div 
                id="multi-selection-box"
                className="absolute bg-white/5 border-[1.5px] border-white/80 rounded-2xl pointer-events-auto cursor-grab active:cursor-grabbing transition-colors duration-200 hover:bg-white/10"
                style={{
                    left: activeBBox.minX - 20, 
                    top: activeBBox.minY - 20,
                    width: activeBBox.width + 40, 
                    height: activeBBox.height + 40,
                    zIndex: 5,
                    willChange: 'transform' // 开启 GPU 加速防抖
                }} 
                onPointerDown={nodeActions.onBoxDragStart}
            />
        )}
        {activeBBox && activeNodes.length > 1 && !dragState && (
            <div 
                className="absolute z-[260] no-drag pointer-events-auto flex items-center justify-center cursor-crosshair origin-center animate-in fade-in zoom-in-95 duration-200"
                style={{
                    left: activeBBox.minX + activeBBox.width + 16,
                    top: activeBBox.minY + activeBBox.height / 2,
                    transform: `translate(0, -50%) scale(${1 / viewport.zoom})`,
                    willChange: 'transform'
                }}
                onPointerDown={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    // 这里触发批量连线
                    nodeActions.onBatchEdgeStart(e, activeNodes.map(n => n.id));
                }}
            >
                <div className="w-7 h-7 bg-[#232323] text-neutral-300 rounded-full border border-white/20 flex items-center justify-center hover:text-white hover:border-white hover:bg-[#333] transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                    <Plus size={14} strokeWidth={3} />
                </div>
            </div>
        )}
        {/* 普通节点层 (已接入视口剔除引擎) */}
        {visibleNodes.filter(n => n.type !== 'group').map(node => (
            <RegularNode 
                key={node.id} 
                node={node} 
                isSelected={selection.includes(node.id)} 
                isMultiSelected={selection.length > 1}
                isDragging={dragState?.type === 'node' && selection.includes(node.id) && drawingNodeId !== node.id && croppingNodeId !== node.id} 
                isDrawing={drawingNodeId === node.id} 
                isCropping={croppingNodeId === node.id} 
                visiblePrompt={!!visiblePrompts[node.id]} 
                projectId={projectId} 
                actions={nodeActions} 
            />
        ))}

        {/* 其他人的协同光标 */}
        {others.map(other => (
            <div key={other.clientId} className="absolute top-0 left-0 pointer-events-none z-[200]" style={{ transform: `translate(${other.cursor.x}px, ${other.cursor.y}px)`, transition: 'transform 0.05s linear' }}>
                <svg width="20" height="28" viewBox="0 0 16 24" fill={other.color} stroke="white" strokeWidth="1.5" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}>
                    <path d="M2.5 2 L13.5 13.5 L8.5 14.5 L12 21 L9.5 22 L6.5 15.5 L2.5 19 Z" strokeLinejoin="round" />
                </svg>
                <div className="absolute top-5 left-5 px-2 py-0.5 rounded shadow-md text-[10px] text-white whitespace-nowrap font-medium" style={{ backgroundColor: other.color }}>{other.name}</div>
            </div>
        ))}

        {/* 👇 工业级：多选悬浮工具栏 👇 */}
        {activeBBox && !dragState && (
            <div className="absolute z-[250] no-drag pointer-events-auto flex items-center bg-[#232323] backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] origin-bottom animate-in fade-in zoom-in-95 duration-200 whitespace-nowrap w-max"
                style={{
                    left: activeBBox.minX + activeBBox.width / 2,
                    top: activeBBox.minY - 24,
                    transform: `translate(-50%, -100%) scale(${1 / viewport.zoom}) translateY(-16px)`,
                    willChange: 'transform'
                }}
                onPointerDown={e => e.stopPropagation()} 
            >
                {/* 批量下载按钮 */}
                <button 
                    onClick={(e) => { e.stopPropagation(); handleBatchDownload(activeNodes); }} 
                    className="flex items-center gap-2 hover:bg-white/10 text-neutral-300 hover:text-white px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
                    title="将选中的图片或视频打包下载"
                >
                    <Download size={16} /> <span>批量下载</span>
                </button>
                
                <div className="w-px h-4 bg-white/10 mx-1"></div>
                
                {/* 区域打组按钮 */}
                <button onClick={(e) => { e.stopPropagation(); handleGroupSelection(activeNodes); }} className="flex items-center gap-2 hover:bg-white/10 text-neutral-300 hover:text-white px-3 py-1.5 rounded-xl text-sm font-medium transition-colors" title="将选中的节点包裹在一个底板中">
                    <Box size={16} /> <span>打组</span>
                </button>
            </div>
        )}
      </div>

      {/* 🟢 各种弹窗、全局面板与悬浮菜单 🟢 */}
      
      {isGlobalDoodling && (
          <GlobalDoodleBoard viewport={viewport} screenToCanvas={screenToCanvas} projectId={projectId}
              onSave={(url, worldX, worldY, width, height) => { pushHistory(); const newNodeId = generateId(); dispatchAndSave(d => ({ nodes: [...d.nodes, { id: newNodeId, type: 'picture', src: url, position: { x: worldX, y: worldY }, size: { w: width, h: height }, _isLoading: false, style: { bgColor: 'transparent' } }] })); setSelection([newNodeId]); setIsGlobalDoodling(false); }}
              onCancel={() => setIsGlobalDoodling(false)}
          />
      )}

      {toast && <Toast message={toast} />}
      
      {previewMedia && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-8 backdrop-blur-md" onPointerDown={() => setPreviewMedia(null)}>
            <button className="absolute top-6 right-6 text-white/50 hover:text-white bg-white/10 p-2 rounded-full"><X size={24}/></button>
            {previewMedia.type === 'video' ? <video src={previewMedia.src} controls autoPlay className="max-w-full max-h-full rounded-lg shadow-2xl outline-none ring-1 ring-white/10" onPointerDown={e=>e.stopPropagation()}/> : <img src={previewMedia.src} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl ring-1 ring-white/10" onPointerDown={e=>e.stopPropagation()}/>}
        </div>
      )}

      {contextMenu && (
        <div className="absolute z-[100] bg-neutral-900 rounded-xl shadow-2xl border border-neutral-700 py-2 w-36 overflow-hidden" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={e => e.stopPropagation()}>
             <button className="w-full text-left px-4 py-2.5 hover:bg-neutral-800 flex items-center gap-3 text-sm text-neutral-300" onClick={() => { createNode('text', { x: contextMenu.cx, y: contextMenu.cy }); setContextMenu(null); }}><Type size={16}/> 文本节点</button>
             <button className="w-full text-left px-4 py-2.5 hover:bg-neutral-800 flex items-center gap-3 text-sm text-blue-400 font-medium" onClick={() => { createNode('image', { x: contextMenu.cx, y: contextMenu.cy }); setContextMenu(null); }}><Cpu size={16}/> 生图节点</button>
             <button className="w-full text-left px-4 py-2.5 hover:bg-neutral-800 flex items-center gap-3 text-sm text-purple-400 font-medium" onClick={() => { createNode('video', { x: contextMenu.cx, y: contextMenu.cy }); setContextMenu(null); }}><Cpu size={16}/> 视频节点</button>
             <button className="w-full text-left px-4 py-2.5 hover:bg-neutral-800 flex items-center gap-3 text-sm text-amber-500 font-medium border-t border-neutral-800" onClick={() => { createNode('group', { x: contextMenu.cx, y: contextMenu.cy }); setContextMenu(null); }}><Box size={16}/> 区域底板</button>
        </div>
      )}
      
      {/* 衍生菜单 (配置驱动版) */}
      {edgeMenu && (() => {
          const isBatch = !!edgeMenu.fromNodeIds;
          
          // 1. 获取所有来源节点的类型列表
          const srcNodeTypes = isBatch 
              ? edgeMenu.fromNodeIds.map(id => nodes.find(n => n.id === id)?.type).filter(Boolean)
              : [nodes.find(n => n.id === edgeMenu.fromNodeId)?.type].filter(Boolean);

          // 2. 根据配置表过滤出当前允许显示的选项
          const availableOptions = EDGE_DERIVATION_OPTIONS.filter(opt => 
              opt.shouldShow(srcNodeTypes, isBatch)
          );

          return (
              <div className="absolute z-[300] bg-neutral-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-neutral-700 w-56 overflow-hidden animate-in fade-in zoom-in-95 duration-100" 
                   style={{ left: edgeMenu.x, top: edgeMenu.y }} 
                   onPointerDown={e => e.stopPropagation()}
              >
                  <div className="px-4 py-3 text-xs text-neutral-500 border-b border-neutral-800 font-medium flex justify-between items-center">
                      <span>{isBatch ? '批量引用并衍生' : '引用该节点衍生'}</span>
                      <button onClick={() => setEdgeMenu(null)} className="hover:text-white"><X size={14}/></button>
                  </div>
                  
                  <div className="max-h-[320px] overflow-y-auto no-scrollbar">
                      {availableOptions.map((opt) => {
                          const IconComponent = opt.icon; // 动态渲染图标组件
                          return (
                              <button 
                                  key={opt.type}
                                  className="w-full text-left px-4 py-3 hover:bg-neutral-800 flex items-center gap-3 text-sm border-b border-neutral-800 last:border-b-0 transition-colors" 
                                  onClick={() => handleCreateFromEdge(opt.type, edgeMenu)}
                              >
                                  <div className={`p-2 rounded-lg ${opt.colorClass}`}>
                                      <IconComponent size={18}/>
                                  </div>
                                  <div>
                                      <div className="font-bold text-neutral-200">{opt.label}</div>
                                      <div className="text-[10px] text-neutral-500 mt-0.5">{opt.description}</div>
                                  </div>
                              </button>
                          );
                      })}

                      {/* 兜底状态：如果没有符合条件的衍生项 */}
                      {availableOptions.length === 0 && (
                          <div className="px-4 py-8 text-center text-xs text-neutral-600">
                              该节点类型暂不支持衍生
                          </div>
                      )}
                  </div>
              </div>
          );
      })()}

      {activeNodes.length === 1 && ['image', 'video'].includes(activeNodes[0].type) && !drawingNodeId && !croppingNodeId && (
        <GenerationPanel key={activeNodes[0].id} mode={activeNodes[0].type} anchorNode={activeNodes[0]} incomingNodes={edges.filter(e => e.to === activeNodes[0].id).map(e => nodes.find(n => n.id === (e.from === activeNodes[0].id ? e.to : e.from))).filter(Boolean)} viewport={viewport} onGenerate={handleGenerate} updateNodeData={updateNodeStrictAndSave} onRemoveConnection={nodeActions.onRemoveConnection}/>
      )}
      <CanvasAgentWidget
            title={agentController.activeConversation?.title || 'Canvas Agent'}

            chatState={{
                messages: agentController.messages,
                input: agentController.input,
                isLoading: agentController.isLoading,
                isAgentBusy: agentController.isAgentBusy,
                error: agentController.error,
            }}
            chatActions={{
                setInput: agentController.setInput,
                onSend: agentController.sendMessage,
                onNewConversation: agentController.newConversation,
            }}

            conversationState={{
                conversations: agentController.conversations,
                activeConversationId: agentController.activeConversationId,
                isLoadingList: agentController.isLoadingList,
            }}
            conversationActions={{
                onRefreshConversations: agentController.refreshConversations,
                onOpenConversation: agentController.openConversation,
                onDeleteConversation: agentController.deleteConversation,
            }}

            skillState={{
                availableSkills: agentController.availableSkills,
                selectedSkillNames: agentController.selectedSkillNames,
                isLoadingSkills: agentController.isLoadingSkills,
                skillsError: agentController.skillsError,
            }}
            skillActions={{
                addSkillName: agentController.addSkillName,
                removeSkillName: agentController.removeSkillName,
                toggleSkillName: agentController.toggleSkillName,
                refreshSkills: agentController.refreshSkills,
            }}

            modelState={{
                agentModelSelector: agentController.agentModelSelector,
            }}

            attachmentState={{
                attachments: agentController.agentAttachments,
                isPickingCanvasImages: agentController.isPickingCanvasImages,
            }}
            attachmentActions={{
                onRemoveAttachment: agentController.removeAgentAttachment,
                onStartPickCanvasImages: agentController.startPickCanvasImages,
                onStopPickCanvasImages: agentController.stopPickCanvasImages,
            }}
        />
    </div>
  );
}
