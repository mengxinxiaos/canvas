import { useMemo, useCallback } from 'react';
import useCanvasStore from '../store/useCanvasStore';
import { generateId, getMediaUrl } from '../utils/helpers';
import { taskService, mediaService } from '../services/api';
import { aiGenerationService } from '../services/aiGenerationService';
import { CANVAS_CONFIG } from '../config/canvas.config';
import { getDimensionsByRatio } from '../utils/helpers';

export function useNodeOperations({
    projectId, shareToken, containerRef, canvasWrapperRef,screenToCanvas,
    dispatchAndSave, updateNodeStrictAndSave, showToast,
    setSelection, setDragState, setContextMenu, setEdgeMenu,
    setPreviewMedia, setVisiblePrompts, drawingNodeId, croppingNodeId,
    setCroppingNodeId, setDrawingNodeId,
    isPickingCanvasImages,
    addCanvasImageAttachment, 
}) {
    const { pushHistory } = useCanvasStore();

    // ================= 1. 工业级多选打组逻辑 =================
    const handleGroupSelection = useCallback((activeNodes) => {
        if (activeNodes.length < 2) return null; 
        
        // 计算包围盒
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        activeNodes.forEach(n => {
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
            maxX = Math.max(maxX, n.position.x + n.size.w);
            maxY = Math.max(maxY, n.position.y + n.size.h);
        });
        
        const width = maxX - minX;
        const height = maxY - minY;

        // 智能留白，避开标题栏
        const PADDING_X = 40;
        const PADDING_TOP = 60; 
        const PADDING_BOTTOM = 40;

        const newGroupId = generateId();
        const newGroupNode = {
            id: newGroupId,
            type: 'group',
            position: { x: minX - PADDING_X, y: minY - PADDING_TOP },
            size: { w: width + PADDING_X * 2, h: height + PADDING_TOP + PADDING_BOTTOM },
            content: '新区域底板'
        };

        pushHistory();
        // 关键：将新底板插入数组最前面，使其自然沉在图层最下方
        dispatchAndSave(d => ({ nodes: [newGroupNode, ...d.nodes] }));
        
        setSelection([newGroupId]); // 选中新生成的底板
        showToast('打组成功');
        
        return newGroupId;
    }, [dispatchAndSave, pushHistory, setSelection, showToast]);

    // ================= 1.5 工业级：批量下载逻辑 =================
    const handleBatchDownload = useCallback(async (activeNodes) => {
        // 1. 过滤出真正可以下载的媒体节点 (排除纯文本、底板或还没生成完的节点)
        const downloadableNodes = activeNodes.filter(n => 
            n.src && ['picture', 'image', 'video', 'video_media'].includes(n.type)
        );

        if (downloadableNodes.length === 0) {
            showToast('选中的内容没有可下载的媒体文件');
            return;
        }

        showToast(`开始下载 ${downloadableNodes.length} 个文件...`);

        let successCount = 0;
        let failCount = 0;

        // 2. 串行下载队列：防止浏览器拦截批量下载
        for (let i = 0; i < downloadableNodes.length; i++) {
            const node = downloadableNodes[i];
            try {
                // 将远程 URL 转为本地 Blob，解决跨域直接打开而不是下载的问题
                const response = await fetch(node.src);
                if (!response.ok) throw new Error('网络请求失败');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                
                // 智能后缀命名
                const ext = node.type.includes('video') ? 'mp4' : 'png';
                a.download = `canvas_${node.id.substring(0, 5)}_${Date.now()}.${ext}`;

                document.body.appendChild(a);
                a.click();
                
                // 立即释放内存
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                successCount++;
                
                // 💡 工业级细节：人为制造 300ms 延迟，绕过浏览器的静默拦截机制
                await new Promise(res => setTimeout(res, 300));
            } catch (err) {
                console.error(`节点 ${node.id} 下载失败:`, err);
                failCount++;
            }
        }

        // 3. 结果反馈
        if (failCount > 0) {
            showToast(`下载结束: ${successCount} 成功, ${failCount} 失败`);
        } else {
            showToast(`🎉 成功批量下载 ${successCount} 个文件`);
        }
    }, [showToast]);

    // ================= 2. 节点创建与衍生 =================
    const createNode = useCallback((type, position) => {
        pushHistory();
        let size = { w: 300, h: 300 }; 
        if (type === 'text') size = { w: 260, h: 100 }; 
        if (type === 'video' || type === 'video_media') size = { w: 360, h: 200 }; 
        if (type === 'group') size = { w: 500, h: 400 };
        
        const newNodeId = generateId();
        const newNode = { id: newNodeId, type, position, size, content: type === 'text' ? '' : undefined };

        dispatchAndSave(d => {
            // 💡 修复：如果是创建底板，强制插入到数组最前面（渲染层级最下）
            if (type === 'group') {
                return { nodes: [newNode, ...d.nodes] };
            }
            return { nodes: [...d.nodes, newNode] };
        });
        
        setSelection([newNodeId]);
    }, [pushHistory, dispatchAndSave, setSelection]);

    const handleCreateFromEdge = useCallback((type, menuData) => {
        pushHistory();
        const newNodeId = generateId();
        const newNode = { 
            id: newNodeId, 
            type, 
            position: { x: menuData.cx, y: menuData.cy }, 
            size: type === 'video' ? { w: 360, h: 200 } : type === 'text' ? { w: 260, h: 100 } : { w: 360, h: 360 }, 
            content: type === 'text' ? '' : undefined 
        };

        // 👇 核心修复：判断是单根线衍生，还是批量连线衍生
        let newEdges = [];
        if (menuData.fromNodeIds) {
            // 批量连线：遍历所有源节点，同时生成多条边指向新节点
            newEdges = menuData.fromNodeIds.map(fromId => ({ 
                id: generateId(), 
                from: fromId, 
                to: newNodeId, 
                label: 'ref' 
            }));
        } else {
            // 原本的单线衍生逻辑
            newEdges = [{ 
                id: generateId(), 
                from: menuData.anchor === 'right' ? menuData.fromNodeId : newNodeId, 
                to: menuData.anchor === 'right' ? newNodeId : menuData.fromNodeId, 
                label: 'ref' 
            }];
        }

        dispatchAndSave(d => ({ nodes: [...d.nodes, newNode], edges: [...d.edges, ...newEdges] }));
        setSelection([newNodeId]); 
        setEdgeMenu(null);
    }, [pushHistory, dispatchAndSave, setSelection, setEdgeMenu]);

    // ================= 3. AI 任务提交 =================
    const handleGenerate = useCallback(async (genParams) => {
        // 💡 核心秘诀：每次执行时，实时获取最新的 Canvas 快照。
        // 不把 canvasState 写进依赖数组，彻底杜绝 Hook 的闭包过期问题！
        const canvasState = useCanvasStore.getState();

        // 将脏活累活全部抛给纯函数处理
        await aiGenerationService.submitTask({
            projectId,
            shareToken,
            genParams,
            canvasState,
            updateNodeStrictAndSave,
            pushHistory,
            showToast
        });
    }, [projectId, shareToken, updateNodeStrictAndSave, pushHistory, showToast]);

    // ================= 4. 节点常规交互事件集合 =================
    const nodeActions = useMemo(() => ({
        updateNodeData: (id, data) => updateNodeStrictAndSave(id, data),

        onAgentPickNode: (e, node) => {
            if (!isPickingCanvasImages) return false;

            e.preventDefault();
            e.stopPropagation();

            if (!node?.src || !['picture', 'image'].includes(node.type)) {
                showToast?.('请选择带图片的画布节点');
                return true;
            }

            const added = addCanvasImageAttachment?.(node);

            if (added) {
                showToast?.('已添加到 Agent 图片引用');
            } else {
                showToast?.('该节点无法作为图片引用');
            }

            return true;
        },

        // 💡 新增：底板一键排版算法 (宫格/水平拓扑) + 自适应底板大小缩放
        onLayoutGroup: (e, groupId, layoutType) => {
            e.stopPropagation();
            pushHistory();
            const state = useCanvasStore.getState();
            const groupNode = state.nodes.find(n => n.id === groupId);
            if (!groupNode) return;

            // 1. 找到该底板内的所有子节点 (基于几何碰撞)
            const childNodes = state.nodes.filter(n =>
                n.id !== groupId &&
                n.position.x + n.size.w / 2 >= groupNode.position.x &&
                n.position.x + n.size.w / 2 <= groupNode.position.x + groupNode.size.w &&
                n.position.y + n.size.h / 2 >= groupNode.position.y &&
                n.position.y + n.size.h / 2 <= groupNode.position.y + groupNode.size.h
            );

            if (childNodes.length === 0) {
                showToast('底板内没有可排版的节点');
                return;
            }

            const { PADDING_X, PADDING_TOP, PADDING_BOTTOM, GAP_X, GAP_Y } = CANVAS_CONFIG.LAYOUT.GRID;

            let updatedNodes = [];

            if (layoutType === 'grid') {
                // ==========================
                // 算法 1：工业级矩阵宫格布局 (严格行列对齐 + 单元格双轴居中)
                // ==========================
                const sortedNodes = [...childNodes].sort((a, b) => {
                    if (Math.abs(a.position.y - b.position.y) > 50) return a.position.y - b.position.y;
                    return a.position.x - b.position.x;
                });

                const cols = Math.ceil(Math.sqrt(sortedNodes.length)); 
                
                // 1. 预扫描：找出每一列的最大宽度，和每一行的最大高度 (划分绝对网格单元)
                const colMaxWidths = new Array(cols).fill(0);
                const rowMaxHeights = [];

                sortedNodes.forEach((node, index) => {
                    const c = index % cols;
                    const r = Math.floor(index / cols);
                    
                    if (rowMaxHeights.length <= r) rowMaxHeights.push(0);

                    colMaxWidths[c] = Math.max(colMaxWidths[c], node.size.w);
                    rowMaxHeights[r] = Math.max(rowMaxHeights[r], node.size.h);
                });

                // 2. 计算每列的 X 坐标基准线和每行的 Y 坐标基准线
                const colStartX = [];
                let currentX = groupNode.position.x + PADDING_X;
                for (let c = 0; c < cols; c++) {
                    colStartX.push(currentX);
                    currentX += colMaxWidths[c] + GAP_X;
                }

                const rowStartY = [];
                let currentY = groupNode.position.y + PADDING_TOP;
                for (let r = 0; r < rowMaxHeights.length; r++) {
                    rowStartY.push(currentY);
                    currentY += rowMaxHeights[r] + GAP_Y;
                }

                // 3. 落位算法：将节点分配到对应网格，并执行中心点对齐
                sortedNodes.forEach((node, index) => {
                    const c = index % cols;
                    const r = Math.floor(index / cols);

                    // 💡 核心居中公式：网格起点坐标 + (网格尺寸 - 节点尺寸) / 2
                    const targetX = colStartX[c] + (colMaxWidths[c] - node.size.w) / 2;
                    const targetY = rowStartY[r] + (rowMaxHeights[r] - node.size.h) / 2;

                    updatedNodes.push({ ...node, position: { x: targetX, y: targetY } });
                });

            } else if (layoutType === 'horizontal') {
                // ==========================
                // 算法 2：水平拓扑布局 (带列级居中对齐)
                // ==========================
                const childIds = new Set(childNodes.map(n => n.id));
                const relevantEdges = state.edges.filter(e => childIds.has(e.from) && childIds.has(e.to));

                const inDegree = {}; const outNodes = {};
                childIds.forEach(id => { inDegree[id] = 0; outNodes[id] = []; });
                relevantEdges.forEach(e => {
                    inDegree[e.to] = (inDegree[e.to] || 0) + 1;
                    if (outNodes[e.from]) outNodes[e.from].push(e.to);
                });

                const levels = {}; 
                let queue = childNodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
                
                if (queue.length === 0) {
                    const leftMost = [...childNodes].sort((a, b) => a.position.x - b.position.x)[0];
                    if (leftMost) queue.push(leftMost.id);
                }

                queue.forEach(id => { levels[id] = 0; });
                let loopGuard = 0; 
                while (queue.length > 0 && loopGuard < 2000) {
                    loopGuard++;
                    const curr = queue.shift();
                    const currLevel = levels[curr];
                    (outNodes[curr] || []).forEach(next => {
                        if (levels[next] === undefined || levels[next] < currLevel + 1) {
                            levels[next] = currLevel + 1;
                            queue.push(next);
                        }
                    });
                }

                childNodes.forEach(n => { if (levels[n.id] === undefined) levels[n.id] = 0; });

                const levelMap = {}; let maxLevel = 0;
                childNodes.forEach(n => {
                    const lvl = levels[n.id];
                    if (!levelMap[lvl]) levelMap[lvl] = [];
                    levelMap[lvl].push(n);
                    maxLevel = Math.max(maxLevel, lvl);
                });

                // 💡 优化 2：第一遍扫描 - 计算每一列的总高度，并找出全局最高的一列
                const colHeights = {};
                let maxColHeight = 0;
                for (let i = 0; i <= maxLevel; i++) {
                    if (!levelMap[i]) continue;
                    let currentHeight = 0;
                    levelMap[i].forEach((node, idx) => {
                        currentHeight += node.size.h;
                        if (idx < levelMap[i].length - 1) currentHeight += GAP_Y;
                    });
                    colHeights[i] = currentHeight;
                    maxColHeight = Math.max(maxColHeight, currentHeight);
                }

                // 第二遍扫描 - 实际落位节点
                let currentX = groupNode.position.x + PADDING_X;

                for (let i = 0; i <= maxLevel; i++) {
                    if (!levelMap[i]) continue;
                    levelMap[i].sort((a, b) => a.position.y - b.position.y);

                    // 💡 核心居中公式：(最高列高度 - 当前列高度) / 2 = 当前列需要向下偏移的量
                    const startYOffset = (maxColHeight - colHeights[i]) / 2;
                    let currentY = groupNode.position.y + PADDING_TOP + startYOffset;
                    
                    let colMaxWidth = 0;

                    levelMap[i].forEach(node => {
                        updatedNodes.push({ ...node, position: { x: currentX, y: currentY } });
                        currentY += node.size.h + GAP_Y;
                        colMaxWidth = Math.max(colMaxWidth, node.size.w);
                    });

                    // 使用巨大的横向间距
                    currentX += colMaxWidth + GAP_X;
                }
            }

            // ==========================
            // 二次包围盒计算，底板尺寸自适应
            // ==========================
            let groupMaxX = groupNode.position.x + 200; 
            let groupMaxY = groupNode.position.y + 200; 

            updatedNodes.forEach(node => {
                groupMaxX = Math.max(groupMaxX, node.position.x + node.size.w);
                groupMaxY = Math.max(groupMaxY, node.position.y + node.size.h);
            });

            updatedNodes.push({ 
                ...groupNode, 
                size: { 
                    w: (groupMaxX - groupNode.position.x) + PADDING_X, 
                    h: (groupMaxY - groupNode.position.y) + PADDING_BOTTOM 
                } 
            });

            const finalDocNodes = state.nodes.map(n => {
                const updated = updatedNodes.find(un => un.id === n.id);
                return updated ? updated : n;
            });
            dispatchAndSave({ nodes: finalDocNodes });
            showToast(layoutType === 'grid' ? '已应用宫格布局' : '已应用水平拓扑布局');
        },
        // 用于精准断开两个节点之间的连线
        onRemoveConnection: (sourceId, targetId) => {
            pushHistory(); // 压入历史栈，支持撤销
            dispatchAndSave(d => ({
                // 遍历 edges，过滤掉起点和终点完全匹配的那根线
                edges: d.edges.filter(e => !(e.from === sourceId && e.to === targetId))
            }));
            // 如果你有 toast 提示需求，也可以在这里加一句 showToast('已断开引用');
        },
        // 解散底板 (仅删除底板容器，保留内部节点)
        onUngroup: (e, groupId) => {
            e.stopPropagation();
            pushHistory();
            const state = useCanvasStore.getState();
            
            // 过滤掉当前的底板节点，也就是把它删除了
            const finalNodes = state.nodes.filter(n => n.id !== groupId);
            
            dispatchAndSave({ nodes: finalNodes });
            setSelection([]); // 解组后清空选中状态
            showToast('已解散区域底板');
        },
        onDoubleClick: (e, node) => {
            e.stopPropagation();
            if (!containerRef.current || !canvasWrapperRef?.current) return;

            const store = useCanvasStore.getState();
            const currentVp = store.viewport;

            const rect = containerRef.current.getBoundingClientRect();
            const viewW = rect.width;
            const viewH = rect.height;

            const PADDING_RATIO = 0.8; 
            const scaleX = (viewW * PADDING_RATIO) / node.size.w;
            const scaleY = (viewH * PADDING_RATIO) / node.size.h;
            
            const targetZoom = Math.min(scaleX, scaleY, 2.5);

            const nodeCenterX = node.position.x + node.size.w / 2;
            const nodeCenterY = node.position.y + node.size.h / 2;
            
            const targetX = viewW / 2 - nodeCenterX * targetZoom;
            const targetY = viewH / 2 - nodeCenterY * targetZoom;

            const startX = currentVp.x;
            const startY = currentVp.y;
            const startZoom = currentVp.zoom;
            
            const duration = 350; 
            const startTime = performance.now();

            const animateZoom = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // 💡 工业级缓动算法 (easeOutExpo)：起步极快，刹车极其平滑，充满物理惯性
                const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

                const currentX = startX + (targetX - startX) * ease;
                const currentY = startY + (targetY - startY) * ease;
                const currentZoom = startZoom + (targetZoom - startZoom) * ease;

                // 🚀 核心性能优化：完全绕过 React，直接操作 DOM 的 transform，触发 GPU 硬件加速
                canvasWrapperRef.current.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentZoom})`;

                if (progress < 1) {
                    requestAnimationFrame(animateZoom);
                } else {
                    // 🏁 动画彻底结束时，才通知 React 更新状态（用于同步小地图、缩放比例 UI 等）
                    store.updateViewport({
                        x: targetX,
                        y: targetY,
                        zoom: targetZoom
                    });
                }
            };
            
            requestAnimationFrame(animateZoom);
        },
        onPointerDown: (e, id) => {
            e.stopPropagation(); 
            if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
            }
            setContextMenu(null);
            
            const state = useCanvasStore.getState();
            let newSelection = [...state.selection];
            const isMultiSelect = e.ctrlKey || e.metaKey || e.shiftKey;

            if (!isMultiSelect && !newSelection.includes(id)) {
                newSelection = [id];
            } else if (isMultiSelect) {
                newSelection = newSelection.includes(id) 
                    ? newSelection.filter(i => i !== id) 
                    : [...newSelection, id];
            }
            
            setSelection(newSelection); 
            pushHistory();
            
            const startNodePos = {};
            const nodeInfo = state.nodes.find(n => n.id === id);
            if (nodeInfo?.type === 'group') {
                state.nodes.forEach(n => {
                    if (n.position.x + n.size.w / 2 >= nodeInfo.position.x && n.position.x + n.size.w / 2 <= nodeInfo.position.x + nodeInfo.size.w && n.position.y + n.size.h / 2 >= nodeInfo.position.y && n.position.y + n.size.h / 2 <= nodeInfo.position.y + nodeInfo.size.h) startNodePos[n.id] = { ...n.position };
                });
            }
            state.nodes.forEach(n => { if (newSelection.includes(n.id)) startNodePos[n.id] = { ...n.position }; });
            
            setDragState(prev => (!prev && !drawingNodeId && !croppingNodeId) ? { type: 'node', start: { x: e.clientX, y: e.clientY }, startNodePos } : prev);
        },
        onBoxDragStart: (e) => {
            e.stopPropagation(); // 阻止事件冒泡到画布底层
            e.preventDefault();
            setContextMenu(null);

            const state = useCanvasStore.getState();
            const startNodePos = {};
            
            // 将当前所有被选中的节点位置记录下来，准备一起拖动
            state.nodes.forEach(n => { 
                if (state.selection.includes(n.id)) {
                    startNodePos[n.id] = { ...n.position }; 
                }
            });

            // 触发底层的 node 拖拽引擎
            setDragState(prev => (!prev && !drawingNodeId && !croppingNodeId) ? { 
                type: 'node', 
                start: { x: e.clientX, y: e.clientY }, 
                startNodePos 
            } : prev);
        },
        onResizeStart: (e, node, dragType = 'resizeNode') => {
            e.stopPropagation(); 
            if (e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
                e.preventDefault();
            }
            setContextMenu(null);
            
            setDragState({ 
                type: dragType, 
                nodeId: node.id, 
                start: { x: e.clientX, y: e.clientY }, 
                startSize: { ...node.size },
                startStyle: node.style ? { ...node.style } : null
            });
        },
        
        onEdgeStart: (e, nodeId, anchor) => {
            e.stopPropagation(); setContextMenu(null);
            const rect = containerRef.current.getBoundingClientRect();
            setDragState({ type: 'edge', nodeId, anchor, currentPos: screenToCanvas(e.clientX - rect.left, e.clientY - rect.top) });
        },
        onBatchEdgeStart: (e, nodeIds) => {
            e.stopPropagation(); setContextMenu(null);
            const rect = containerRef.current.getBoundingClientRect();
            // 记录 type 为 'batchEdge'，并把选中的节点 ID 数组存下来
            setDragState({ type: 'batchEdge', nodeIds, currentPos: screenToCanvas(e.clientX - rect.left, e.clientY - rect.top) });
        },
        // useNodeOperations.js

        onMirror: async (e, nodeId, src) => {
            e.stopPropagation(); pushHistory(); updateNodeStrictAndSave(nodeId, { _isLoading: true });
            try {
                const img = new Image(); 
                img.crossOrigin = 'anonymous'; // 这一步要求后端 S3/OSS 必须允许跨域
                img.src = src;
                await new Promise((resolve, reject) => { 
                    img.onload = resolve; 
                    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED')); 
                });

                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.translate(canvas.width, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0);
                
                // 如果跨域头没配对，这里 toBlob 会抛出 SecurityError
                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob((b) => {
                        if (b) resolve(b);
                        else reject(new Error('CANVAS_TAINTED'));
                    }, 'image/png');
                });

                const file = new File([blob], `mirror_${Date.now()}.png`, { type: 'image/png' });
                const res = await mediaService.uploadFile(file, projectId, 'mirror');
                
                updateNodeStrictAndSave(nodeId, { src: getMediaUrl(res.url), _isLoading: false });
            } catch (err) {
                updateNodeStrictAndSave(nodeId, { _isLoading: false });
                
                // 💡 细化的错误处理
                if (err.name === 'SecurityError' || err.message === 'CANVAS_TAINTED') {
                    console.error("CORS 污染导致画布无法导出:", err);
                    showToast("图片跨域限制 (CORS)，无法执行镜像。请联系管理员检查存储桶配置。");
                } else if (err.message === 'IMAGE_LOAD_FAILED') {
                    showToast("图片加载失败，请检查网络或图片源是否有效。");
                } else {
                    showToast("镜像处理异常，请重试。");
                }
            }
        },
        
        onRemix: (e, sourceNode) => {
            e.stopPropagation(); 
            pushHistory();
            const state = useCanvasStore.getState();
            
            const freshNode = state.nodes.find(n => n.id === sourceNode.id) || sourceNode;
            const newNodeId = generateId(); 
            
            const genType = ['video', 'video_media'].includes(freshNode.type) ? 'video' : 'image';
            
            // 1. 深拷贝参数对象
            let clonedGeneration = freshNode.generation ? JSON.parse(JSON.stringify(freshNode.generation)) : undefined;

            // 提示词清洗逻辑
            if (clonedGeneration) {
                clonedGeneration.prompt = clonedGeneration.rawPrompt;
            }
            const ratioStr = clonedGeneration?.aspectRatio || '1:1';
            const initialSize = getDimensionsByRatio(ratioStr, 360);

            const newNode = { 
                id: newNodeId, 
                type: genType, 
                position: { 
                    x: freshNode.position.x + freshNode.size.w + 40, 
                    y: freshNode.position.y 
                }, 
                size: initialSize,
                // 3. 将清洗干净的参数注入新节点
                generation: clonedGeneration 
            };
            
            const newEdges = state.edges
                .filter(edge => edge.to === freshNode.id)
                .map(edge => ({ id: generateId(), from: edge.from, to: newNodeId, label: 'ref' }));
                
            dispatchAndSave(d => ({ 
                nodes: [...d.nodes, newNode], 
                edges: [...d.edges, ...newEdges] 
            }));
            
            setSelection([newNodeId]); 
            showToast("已创建新的复刻节点");
        },

        onTogglePrompt: (e, id) => { e.stopPropagation(); setVisiblePrompts(p => ({...p, [id]: !p[id]})); },
        onCopyPrompt: (e, promptText) => {
            e.stopPropagation(); 
            navigator.clipboard.writeText(promptText).then(()=>showToast('提示词已复制')).catch(()=>{
                const textarea = document.createElement('textarea'); textarea.value = promptText; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea); showToast('提示词已复制');
            });
        },
        onCropStart: (e, id) => { if(e) e.stopPropagation(); setCroppingNodeId(id); },
        onDrawStart: (e, id) => { if(e) e.stopPropagation(); setDrawingNodeId(id); },
        onPreview: (e, node) => { e.stopPropagation(); setPreviewMedia({ type: node.type.includes('video') ? 'video' : 'image', src: node.src }); },
        onDownload: async (e, src, type) => {
            e.stopPropagation();
            try { 
                const blob = await (await fetch(src)).blob(); 
                const url = window.URL.createObjectURL(blob); 
                const a = document.createElement('a'); a.style.display = 'none'; a.href = url; 
                a.download = `canvas_${type}_${Date.now()}.${type === 'video_media' ? 'mp4' : 'png'}`; 
                document.body.appendChild(a); a.click(); 
                window.URL.revokeObjectURL(url); document.body.removeChild(a); 
            } catch (err) { showToast("下载失败，请检查网络设置"); }
        },
        onContentChange: (nodeId, val) => dispatchAndSave(d => ({ nodes: d.nodes.map(n => n.id === nodeId ? {...n, content: val} : n) })),
        onChangeAspectRatio: (nodeId, newRatio) => {
            pushHistory(); // 压入历史栈，支持撤销
            const state = useCanvasStore.getState();
            const node = state.nodes.find(n => n.id === nodeId);
            if (!node) return;

            // 1. 根据字符串（如 '16:9'）算出新的物理尺寸
            const newSize = getDimensionsByRatio(newRatio, 360); 

            // 2. 合并你的生成参数 (假设你存在 node.generation 中)
            const updatedGeneration = node.generation 
                ? { ...node.generation, aspect_ratio: newRatio } 
                : { aspect_ratio: newRatio };

            // 3. 同时更新尺寸和参数数据，触发画布实时重绘
            updateNodeStrictAndSave(nodeId, {
                size: newSize,
                generation: updatedGeneration
            });
        },
        onDoodleSave: (nodeId, url) => { pushHistory(); updateNodeStrictAndSave(nodeId, { src: url }); setDrawingNodeId(null); },
        onCropSave: (nodeId, newUrl, w, h, x, y) => { pushHistory(); updateNodeStrictAndSave(nodeId, { src: newUrl, size: { w, h }, position: { x, y } }); setCroppingNodeId(null); },
        onSplitSave: (nodeId, newUrls, cols, rows, pieceW, pieceH) => {
              pushHistory();
              const state = useCanvasStore.getState();
              const sourceNode = state.nodes.find(n => n.id === nodeId);
              if (!sourceNode) return;
              const newNodes = []; const newEdges = [];
              const displayW = 200; const displayH = (pieceH / pieceW) * displayW;
              let startX = sourceNode.position.x + sourceNode.size.w + 60; let startY = sourceNode.position.y;
              newUrls.forEach((url, index) => {
                  const newId = generateId();
                  newNodes.push({ id: newId, type: 'picture', src: url, position: { x: startX + (index % cols) * (displayW + 20), y: startY + Math.floor(index / cols) * (displayH + 20) }, size: { w: displayW, h: displayH }, _isLoading: false });
                  newEdges.push({ id: generateId(), from: nodeId, to: newId, label: 'split' });
              });
              dispatchAndSave(d => ({ nodes: [...d.nodes, ...newNodes], edges: [...d.edges, ...newEdges] }));
              setCroppingNodeId(null);
        }
        }), [
            projectId,
            pushHistory,
            dispatchAndSave,
            updateNodeStrictAndSave,
            showToast,
            canvasWrapperRef,
            screenToCanvas,
            containerRef,
            isPickingCanvasImages,
            addCanvasImageAttachment,
        ]);  
        
        return { handleGroupSelection, handleBatchDownload, createNode, handleCreateFromEdge, handleGenerate, nodeActions };
}
