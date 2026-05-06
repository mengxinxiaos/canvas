import { useState, useRef, useEffect, useCallback } from 'react';
import useCanvasStore from '../store/useCanvasStore';
import { generateId } from '../utils/helpers';
import { calculateBezierPath } from '../utils/geometry';

export function useCanvasInteraction({
    containerRef,
    canvasWrapperRef, 
    screenToCanvas,
    dispatchAndSave,
    saveToCloud,
    setEdgeMenu,
    setContextMenu 
}) {
    const [dragState, setDragState] = useState(null);
    const dragFrameRef = useRef(null);
    const transientState = useRef({}); 

    const { updateViewport, setSelection, pushHistory } = useCanvasStore();
    
    const updateConnectedEdgesDOM = (currentDoc, movedNodeIds, newPositions, newSizes, domCache, nodeMap) => {
        currentDoc.edges.forEach(edge => {
            if (movedNodeIds.has(edge.from) || movedNodeIds.has(edge.to)) {
                const fromNode = nodeMap.get(edge.from);
                const toNode = nodeMap.get(edge.to);
                if (!fromNode || !toNode) return;

                const fx = newPositions[edge.from]?.x ?? fromNode.position.x;
                const fy = newPositions[edge.from]?.y ?? fromNode.position.y;
                const fw = newSizes[edge.from]?.w ?? fromNode.size.w;
                const fh = newSizes[edge.from]?.h ?? fromNode.size.h;

                const tx = newPositions[edge.to]?.x ?? toNode.position.x;
                const ty = newPositions[edge.to]?.y ?? toNode.position.y;
                const tw = newSizes[edge.to]?.w ?? toNode.size.w;
                const th = newSizes[edge.to]?.h ?? toNode.size.h;

                const x1 = fx + fw; const y1 = fy + fh / 2;
                const x2 = tx;      const y2 = ty + th / 2;
               
                const d = calculateBezierPath({ x: x1, y: y1 }, { x: x2, y: y2 });

                let paths = domCache.edges.get(edge.id);
                if (!paths) {
                    const edgeGroup = document.querySelector(`[data-edge-id="${edge.id}"]`);
                    if (edgeGroup) {
                        paths = Array.from(edgeGroup.querySelectorAll('path'));
                        domCache.edges.set(edge.id, paths); 
                    }
                }
                
                if (paths) {
                    paths.forEach(p => p.setAttribute('d', d));
                }
            }
        });
    };

    const handleCanvasPointerDown = useCallback((e) => {
        if (e.target.closest('.doodle-toolbar') || e.target.closest('.crop-toolbar')) return;
        if (e.target.closest('.group-resize-handle') || e.target.closest('.no-drag')) return;
        
        // 💡 核心修改：判断是否按下了 Cmd (Mac) 或 Ctrl (Win)
        const isForceCanvas = e.metaKey || e.ctrlKey || e.button === 1;

        // 如果按下了穿透快捷键，强制判定为“未点中任何节点/连线”，把事件交给画布底层
        const isNodeHit = e.target.closest('[data-node-id]') && !isForceCanvas; 
        const isEdgeHit = e.target.closest('[data-edge-id]') && !isForceCanvas;
        
        if (!isNodeHit && !isEdgeHit) {
            setEdgeMenu(null); 
            if (setContextMenu) setContextMenu(null); 
            
            const startPos = { x: e.clientX, y: e.clientY }; 
            const startVp = useCanvasStore.getState().viewport;
            
            if (e.button === 1 || (e.button === 0 && e.shiftKey)) { 
                e.preventDefault(); 
                setDragState({ type: 'pan', start: startPos, startVp }); 
                setSelection([]); 
            } else if (e.button === 0 && !e.shiftKey) { 
                e.preventDefault(); 
                setDragState({ type: 'box', start: startPos }); 
                // 💡 注意：这里清空了选中状态，这样拉框的时候视觉更干净
                setSelection([]); 
                transientState.current = { box: { x: 0, y: 0, w: 0, h: 0 } };
            }
        }
    }, [setSelection, setEdgeMenu, setContextMenu]);

    useEffect(() => {
        if (!dragState) {
            if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
            return; 
        }

        const handlePointerMove = (e) => {
            const { clientX, clientY } = e;
            if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);

            dragFrameRef.current = requestAnimationFrame(() => {
                const currentDoc = useCanvasStore.getState();
                const zoom = currentDoc.viewport.zoom;

                if (dragState.type === 'pan') {
                    const newX = dragState.startVp.x + (clientX - dragState.start.x);
                    const newY = dragState.startVp.y + (clientY - dragState.start.y);
                    if (canvasWrapperRef.current) {
                        canvasWrapperRef.current.style.transform = `translate(${newX}px, ${newY}px) scale(${zoom})`;
                    }
                    
                    transientState.current.viewport = { x: newX, y: newY, zoom };

                    
                } 
                else if (dragState.type === 'box') {
                    const boxX = Math.min(dragState.start.x, clientX);
                    const boxY = Math.min(dragState.start.y, clientY);
                    const boxW = Math.abs(dragState.start.x - clientX);
                    const boxH = Math.abs(dragState.start.y - clientY);

                    transientState.current.box = { x: boxX, y: boxY, w: boxW, h: boxH };

                    const boxEl = document.getElementById('fast-selection-box');
                    if (boxEl) {
                        boxEl.style.display = 'block';
                        boxEl.style.left = `${boxX}px`; boxEl.style.top = `${boxY}px`;
                        boxEl.style.width = `${boxW}px`; boxEl.style.height = `${boxH}px`;
                    }
                } 
                else if (['node', 'resizeGroup', 'resizeNode', 'resizeFree', 'resizeTextScale'].includes(dragState.type)) {
                    const dx = (clientX - dragState.start.x) / zoom; 
                    const dy = (clientY - dragState.start.y) / zoom;

                    if (!transientState.current.domCache) {
                        transientState.current.domCache = { nodes: new Map(), edges: new Map() };
                        transientState.current.nodeMap = new Map(currentDoc.nodes.map(n => [n.id, n]));
                    }
                    const { domCache, nodeMap } = transientState.current;

                    const newPositions = transientState.current.positions || {};
                    const newSizes = transientState.current.sizes || {};
                    const movedNodeIds = new Set();

                    if (dragState.type === 'node') {
                        Object.keys(dragState.startNodePos).forEach(id => {
                            let el = domCache.nodes.get(id);
                            if (!el) {
                                el = document.querySelector(`[data-node-id="${id}"]`);
                                if (el) domCache.nodes.set(id, el);
                            }

                            if (el) {
                                const newX = dragState.startNodePos[id].x + dx;
                                const newY = dragState.startNodePos[id].y + dy;
                                newPositions[id] = { x: newX, y: newY };
                                movedNodeIds.add(id);
                                el.style.transform = `translate3d(${newX}px, ${newY}px, 0)`; 
                                let panelEl = domCache.nodes.get(`panel-${id}`);
                                if (panelEl === undefined) {
                                    panelEl = document.querySelector(`[data-panel-for="${id}"]`);
                                    domCache.nodes.set(`panel-${id}`, panelEl || null);
                                }
                                if (panelEl) {
                                    const node = nodeMap.get(id);
                                    if (node) {
                                        const vX = currentDoc.viewport.x;
                                        const vY = currentDoc.viewport.y;
                                        const nodeBottomScreenY = (newY + node.size.h) * zoom + vY;
                                        const nodeCenterScreenX = (newX + node.size.w / 2) * zoom + vX;
                                        const panelWidth = panelEl.offsetWidth || 520;

                                        let left = nodeCenterScreenX - panelWidth / 2;
                                        let top = nodeBottomScreenY + 16;

                                        if (left < 20) left = 20;
                                        if (left + panelWidth > window.innerWidth - 20) left = window.innerWidth - panelWidth - 20;

                                        panelEl.style.transform = `translate3d(${left}px, ${top}px, 0)`;
                                    }
                                }
                            }
                        });

                        // 🌟 工业级核心：让多选包围盒也参与 120fps 高速缓存渲染！
                        if (Object.keys(dragState.startNodePos).length > 1) {
                            let multiBox = domCache.nodes.get('multi-selection-box');
                            if (!multiBox) {
                                // 基于容器查找
                                multiBox = containerRef.current?.querySelector('.engine-multi-selection-box');
                                if (multiBox) domCache.nodes.set('multi-selection-box', multiBox);
                            }   
                            if (multiBox) {
                                // 直接应用 dx/dy 的物理位移，与节点保持完美同步
                                multiBox.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
                            }
                        }

                    } else if (['resizeGroup', 'resizeNode', 'resizeFree', 'resizeTextScale'].includes(dragState.type)) {
                        let el = domCache.nodes.get(dragState.nodeId);
                        if (!el) {
                            el = document.querySelector(`[data-node-id="${dragState.nodeId}"]`);
                            if (el) domCache.nodes.set(dragState.nodeId, el);
                        }

                        if (el) {
                            let newW, newH;
                            if (dragState.type === 'resizeGroup') {
                                newW = Math.max(200, dragState.startSize.w + dx);
                                newH = Math.max(200, dragState.startSize.h + dy);
                            } else if (dragState.type === 'resizeFree') {
                                newW = Math.max(100, dragState.startSize.w + dx);
                                newH = Math.max(40, dragState.startSize.h + dy); 
                            } else if (dragState.type === 'resizeTextScale') {
                                const ratio = dragState.startSize.w / dragState.startSize.h;
                                newW = Math.max(100, dragState.startSize.w + dx);
                                newH = newW / ratio;
                                
                                const scaleRatio = newW / dragState.startSize.w;
                                let newFontSize = Math.round((dragState.startStyle?.fontSize || 16) * scaleRatio);
                                newFontSize = Math.max(12, Math.min(newFontSize, 400));
                                
                                if (!transientState.current.styles) transientState.current.styles = {};
                                transientState.current.styles[dragState.nodeId] = { ...dragState.startStyle, fontSize: newFontSize };

                                let textTargets = domCache.nodes.get(`${dragState.nodeId}-texts`);
                                if (!textTargets) {
                                    textTargets = Array.from(el.querySelectorAll('.text-render-target'));
                                    domCache.nodes.set(`${dragState.nodeId}-texts`, textTargets);
                                }
                                textTargets.forEach(t => { t.style.fontSize = `${newFontSize}px`; });
                            } else {
                                const ratio = dragState.startSize.w / dragState.startSize.h;
                                newW = Math.max(100, dragState.startSize.w + dx);
                                newH = newW / ratio;
                                if (newW > 2560 || newH > 2560) {
                                    if (ratio >= 1) { newW = 2560; newH = 2560 / ratio; } 
                                    else { newH = 2560; newW = 2560 * ratio; }
                                }
                            }
                            newSizes[dragState.nodeId] = { w: newW, h: newH };
                            movedNodeIds.add(dragState.nodeId);
                            el.style.width = `${newW}px`;
                            el.style.height = `${newH}px`;
                        }
                    }

                    transientState.current.positions = newPositions;
                    transientState.current.sizes = newSizes;
                    updateConnectedEdgesDOM(currentDoc, movedNodeIds, newPositions, newSizes, domCache, nodeMap);
                }
                else if (dragState.type === 'edge' || dragState.type === 'batchEdge') {
                    const rect = containerRef.current.getBoundingClientRect();
                    const currentPos = screenToCanvas(clientX - rect.left, clientY - rect.top);
                    transientState.current.edgePos = currentPos;

                    const edgeEl = document.getElementById('fast-drawing-edge');
                    if (edgeEl) {
                        edgeEl.style.display = 'block';
                        let dPath = ''; 

                        if (dragState.type === 'edge') {
                            const node = currentDoc.nodes.find(n => n.id === dragState.nodeId);
                            if (node) {
                                let x1 = dragState.anchor === 'right' ? node.position.x + node.size.w : currentPos.x;
                                let y1 = dragState.anchor === 'right' ? node.position.y + node.size.h / 2 : currentPos.y;
                                let x2 = dragState.anchor === 'right' ? currentPos.x : node.position.x;
                                let y2 = dragState.anchor === 'right' ? currentPos.y : node.position.y + node.size.h / 2;
                                
                                dPath = calculateBezierPath({ x: x1, y: y1 }, { x: x2, y: y2 });
                            }
                        } else if (dragState.type === 'batchEdge') {
                            dragState.nodeIds.forEach(id => {
                                const node = currentDoc.nodes.find(n => n.id === id);
                                if (node) {
                                    let x1 = node.position.x + node.size.w;
                                    let y1 = node.position.y + node.size.h / 2;
                                    let x2 = currentPos.x;
                                    let y2 = currentPos.y;
                                    
                                    dPath += calculateBezierPath({ x: x1, y: y1 }, { x: x2, y: y2 });
                                }
                            });
                        }
                        edgeEl.setAttribute('d', dPath);
                    }
                }
            });
        };

        const handlePointerUp = (e) => {
            if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
            const currentDoc = useCanvasStore.getState();
            
            const boxEl = document.getElementById('fast-selection-box');
            if (boxEl) boxEl.style.display = 'none';
            const edgeEl = document.getElementById('fast-drawing-edge');
            if (edgeEl) edgeEl.style.display = 'none';

            if (dragState.type === 'pan' && transientState.current.viewport) { 
                updateViewport(transientState.current.viewport);
                saveToCloud({ ...currentDoc, viewport: transientState.current.viewport }); 
            } 
            else if (dragState.type === 'box' && transientState.current.box) {
                const rect = containerRef.current.getBoundingClientRect();
                const box = transientState.current.box;
                if (box.w > 0 && box.h > 0) {
                    const boxWorld = { 
                        x1: screenToCanvas(box.x - rect.left, 0).x, y1: screenToCanvas(0, box.y - rect.top).y, 
                        x2: screenToCanvas(box.x + box.w - rect.left, 0).x, y2: screenToCanvas(0, box.y + box.h - rect.top).y 
                    };
                    setSelection(currentDoc.nodes.filter(n => n.type !== 'group' && n.position.x < boxWorld.x2 && (n.position.x + n.size.w) > boxWorld.x1 && n.position.y < boxWorld.y2 && (n.position.y + n.size.h) > boxWorld.y1).map(n => n.id));
                }
            } 
            else if (['node', 'resizeGroup', 'resizeNode', 'resizeFree', 'resizeTextScale'].includes(dragState.type)) {
                
                // 🌟 工业级：松手时清理多选框的临时位移，交还给 React 计算
                const multiBox = document.getElementById('multi-selection-box');
                if (multiBox) multiBox.style.transform = 'translate3d(0px, 0px, 0)';

                const positions = transientState.current.positions || {};
                const sizes = transientState.current.sizes || {};
                const styles = transientState.current.styles || {};
                let hasChanges = false;

                const newNodes = currentDoc.nodes.map(n => {
                    let updated = { ...n };
                    if (positions[n.id]) { updated.position = positions[n.id]; hasChanges = true; }
                    if (sizes[n.id]) { updated.size = sizes[n.id]; hasChanges = true; }
                    if (styles[n.id]) { updated.style = { ...n.style, ...styles[n.id] }; hasChanges = true; }
                    return updated;
                });
                
                if (hasChanges) dispatchAndSave({ nodes: newNodes });
            } 
            else if (dragState.type === 'edge' || dragState.type === 'batchEdge') {
                const targetNodeEl = e.target.closest('[data-node-id]');
                let targetId = targetNodeEl ? targetNodeEl.getAttribute('data-node-id') : null;
                
                if (targetId) {
                    const targetNode = currentDoc.nodes.find(n => n.id === targetId);
                    if (targetNode?.type === 'group') {
                        targetId = null; 
                    }
                }

                if (targetId) {
                    pushHistory();
                    if (dragState.type === 'edge' && targetId !== dragState.nodeId) {
                        dispatchAndSave(d => ({ edges: [...d.edges, { id: generateId(), from: dragState.anchor === 'right' ? dragState.nodeId : targetId, to: dragState.anchor === 'right' ? targetId : dragState.nodeId, label: 'ref' }] }));
                    } else if (dragState.type === 'batchEdge') {
                        const newEdges = dragState.nodeIds.filter(id => id !== targetId).map(id => ({ id: generateId(), from: id, to: targetId, label: 'ref' }));
                        if (newEdges.length > 0) dispatchAndSave(d => ({ edges: [...d.edges, ...newEdges] }));
                    }
                } 
                else if (transientState.current.edgePos) {
                    if (dragState.type === 'edge') {
                        setEdgeMenu({ fromNodeId: dragState.nodeId, anchor: dragState.anchor, x: e.clientX, y: e.clientY, cx: transientState.current.edgePos.x, cy: transientState.current.edgePos.y });
                    } else if (dragState.type === 'batchEdge') {
                        setEdgeMenu({ fromNodeIds: dragState.nodeIds, x: e.clientX, y: e.clientY, cx: transientState.current.edgePos.x, cy: transientState.current.edgePos.y });
                    }
                }
            }
            
            setDragState(null);
            transientState.current = {}; 
        };

        window.addEventListener('pointermove', handlePointerMove); 
        window.addEventListener('pointerup', handlePointerUp);
        return () => { 
            window.removeEventListener('pointermove', handlePointerMove); 
            window.removeEventListener('pointerup', handlePointerUp); 
            if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current); 
        };
    }, [dragState, screenToCanvas, dispatchAndSave, pushHistory, saveToCloud, setSelection, setEdgeMenu, containerRef, canvasWrapperRef, updateViewport]);

    return { dragState, setDragState, handleCanvasPointerDown };
}