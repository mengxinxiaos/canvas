import { useEffect, useCallback } from 'react';
import useCanvasStore from '../store/useCanvasStore';
import { generateId, getMediaUrl, getImageDimensions, getVideoDimensions, calculateNodeSize } from '../utils/helpers';
import { mediaService } from '../services/api';

export function useCanvasHotkeys({
    projectId,
    dispatchAndSave,
    updateNodeStrictAndSave,
    saveToCloud,
    setSelection,
    setDrawingNodeId,
    setEdgeMenu,
    setPreviewMedia,
    setCroppingNodeId,
    setContextMenu
}) {
    const { undo, redo, pushHistory } = useCanvasStore();

    // 1. 处理文件上传 (拖拽/粘贴) - 工业级并发极速版
    const handleUploadFiles = useCallback(async (files, startPos) => {
        if (files.length === 0) return;
        pushHistory();

        const MAX_COLS = files.length > 4 ? 3 : files.length;
        const GAP = 40; 
        const BASE_SIZE = 360; 

        // ==========================================
        // 第一步：瞬间计算所有节点，一次性推入 UI (无阻塞)
        // ==========================================
        const uploadTasks = files.map((file, i) => {
            const tempId = generateId();
            const row = Math.floor(i / MAX_COLS);
            const col = i % MAX_COLS;
            
            return {
                id: tempId,
                file: file,
                initialData: {
                    id: tempId, 
                    type: file.type.startsWith('video/') ? 'video_media' : 'picture', 
                    position: { x: startPos.x + col * (BASE_SIZE + GAP), y: startPos.y + row * (BASE_SIZE + GAP) }, 
                    size: { w: BASE_SIZE, h: BASE_SIZE }, 
                    _isLoading: true
                }
            };
        });

        // 瞬间让所有 loading 占位框出现在画布上
        dispatchAndSave(d => ({ 
            nodes: [...d.nodes, ...uploadTasks.map(t => t.initialData)] 
        }));

        // ==========================================
        // 第二步：并发执行读取尺寸和网络上传 (10通道全开)
        // ==========================================
        // 使用 Promise.allSettled 保证某一张图上传失败不会引发整个应用崩溃
        await Promise.allSettled(uploadTasks.map(async ({ id, file }) => {
            try {
                // 1. 本地极速计算尺寸
                let finalSize = { w: BASE_SIZE, h: BASE_SIZE };
                
                // 无论是图片还是视频，都先创建一个本地的内存 URL
                const localUrl = URL.createObjectURL(file);
                
                try {
                    if (file.type.startsWith('image/')) {
                        const dims = await getImageDimensions(localUrl);
                        finalSize = calculateNodeSize(dims.w, dims.h, BASE_SIZE);
                    } else if (file.type.startsWith('video/')) {
                        // 🎬 核心修复：用刚刚写的工具函数读取真实的视频宽高
                        const dims = await getVideoDimensions(localUrl);
                        finalSize = calculateNodeSize(dims.w, dims.h, BASE_SIZE);
                    }
                } finally {
                    // 确保无论成功失败，都释放内存，防止内存泄漏！
                    URL.revokeObjectURL(localUrl); 
                }

                // 2. 发起网络请求 (此时所有文件是一起发出的)
                // 注意：你原来的代码这里写的是 res.url，但根据前面 api.js 来看，可能是 res.data.url
                const res = await mediaService.uploadFile(file, projectId);
                const remoteUrl = res.url || res.data?.url; 
                
                // 3. 单个文件完成，局部更新该节点
                updateNodeStrictAndSave(id, { 
                    src: getMediaUrl(remoteUrl), 
                    _isLoading: false, 
                    size: finalSize 
                });
            } catch (err) { 
                console.error(`文件 ${file.name} 上传失败:`, err);
                updateNodeStrictAndSave(id, { _isLoading: false, _error: '上传失败' }); 
            }
        }));

    }, [projectId, pushHistory, dispatchAndSave, updateNodeStrictAndSave]);

    // 2. 键盘与粘贴事件监听
    useEffect(() => {
        const handleKeyDown = (e) => {
            
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'|| e.target.closest('[contenteditable="true"]')) return;
            
            // 撤销/重做
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
                saveToCloud(useCanvasStore.getState());
                return;
            }
            
            // 删除节点
            if (e.key === 'Delete' || e.key === 'Backspace') {
                pushHistory(); 
                const state = useCanvasStore.getState();
                dispatchAndSave(d => ({ 
                    nodes: d.nodes.filter(n => !state.selection.includes(n.id)), 
                    edges: d.edges.filter(e => !state.selection.includes(e.id) && !state.selection.includes(e.from) && !state.selection.includes(e.to)) 
                }));
                setSelection([]);
            }
            
            // ESC 清除状态
            if (e.key === 'Escape') { 
                setSelection([]); setDrawingNodeId(null); setEdgeMenu(null); 
                setPreviewMedia(null); setCroppingNodeId(null); setContextMenu(null); 
            }
        };

        const handlePaste = (e) => {
            
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'|| e.target.closest('[contenteditable="true"]')) return;
            if (!e.clipboardData?.items) return;
            const vp = useCanvasStore.getState().viewport;
            handleUploadFiles(
                Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/') || i.type.startsWith('video/')).map(i => i.getAsFile()), 
                {x: (window.innerWidth / 2 - vp.x) / vp.zoom, y: (window.innerHeight / 2 - vp.y) / vp.zoom}
            );
        };

        window.addEventListener('keydown', handleKeyDown); 
        window.addEventListener('paste', handlePaste);
        return () => { 
            window.removeEventListener('keydown', handleKeyDown); 
            window.removeEventListener('paste', handlePaste); 
        };
    }, [dispatchAndSave, saveToCloud, pushHistory, undo, redo, setSelection, handleUploadFiles, setDrawingNodeId, setEdgeMenu, setPreviewMedia, setCroppingNodeId, setContextMenu]);

    return { handleUploadFiles };
}