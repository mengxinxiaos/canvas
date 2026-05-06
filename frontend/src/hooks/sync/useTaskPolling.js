import { useEffect, useRef } from 'react';
import { taskService } from '../../services/api';
import { getMediaUrl, getImageDimensions,getVideoDimensions, calculateNodeSize } from '../../utils/helpers';
import useCanvasStore from '../../store/useCanvasStore';

export function useTaskPolling(updateNodeStrictAndSave) {
    const nodes = useCanvasStore(state => state.nodes);
    const pendingTasksRef = useRef([]);

    useEffect(() => {
        pendingTasksRef.current = nodes.filter(n => n._isLoading && n.taskId);
    }, [nodes]);

    useEffect(() => {
        const poll = async () => {
            const pendingNodes = pendingTasksRef.current;
            if (pendingNodes.length === 0) return;

            for (const node of pendingNodes) {
                try {
                    const status = await taskService.queryTaskStatus(node.taskId);
                    console.log(`\n========================================`);
                    console.log(`📥 [轮询数据] 任务 ${node.taskId} 后端完整返回:`, status);

                    // 1. 深度扫描：寻找表示“状态”的字段
                    const actualStatus = 
                        status?.status || 
                        status?.data?.status || 
                        status?.state || 
                        status?.data?.state || 
                        status?.task_status || 
                        status?.data?.task_status;

                    let statusStr = String(actualStatus).toLowerCase();
                    console.log(`🔍 [解析状态] 提取到的状态词是: "${statusStr}"`);

                    if (statusStr === 'success' || statusStr === 'completed' || statusStr === 'finished' || statusStr === 'succeeded' || statusStr === '200') {
                        
                        // 2. 深度扫描：寻找媒体 URL 字段
                        const rawUrl = 
                            status?.result?.url || 
                            status?.url || 
                            status?.data?.url || 
                            status?.result_json?.url || // 兼容后端的 result_json
                            status?.data?.output?.url || 
                            status?.output?.url || 
                            status?.image_url || 
                            status?.video_url ||
                            status?.data?.image_url;

                        console.log(`🔗 [解析链接] 提取到的 URL 是:`, rawUrl);

                        if (!rawUrl) {
                            console.error(`❌ [致命错误] 任务判定为成功，但在后端的返回中找不到 URL！`);
                            continue; 
                        }

                        console.log(`⚙️ [开始处理] 正在计算尺寸并转存...`);
                        const url = getMediaUrl(rawUrl);
                        let size = node.size;
                        
                        try {
                            // 💡 取当前节点宽度和高度中的最大值作为 maxEdge，兼容横竖图
                            const currentMaxEdge = Math.max(node.size.w, node.size.h, 360);

                            if (node.type == 'picture') {
                                const dims = await getImageDimensions(url);
                                size = calculateNodeSize(dims.w, dims.h, currentMaxEdge);
                            } else if (node.type == 'video') {
                                const dims = await getVideoDimensions(url);
                                size = calculateNodeSize(dims.w, dims.h, currentMaxEdge);
                            }
                        } catch (err) {
                            console.warn("⚠️ 获取媒体尺寸失败，将使用默认尺寸", err);
                        }

                        const targetType = node.type === 'video' ? 'video_media' : 'picture';
                        
                        // 3. 将成功的数据打入 Yjs 协同引擎
                        updateNodeStrictAndSave(node.id, {
                            type: targetType,
                            src: url, 
                            size, 
                            _isLoading: false, 
                            taskId: null,
                            _loadingText: null // 成功后清除文案
                        });
                        console.log(`✅ [渲染成功] 节点 ${node.id} 已成功上屏！`);
                        console.log(`========================================\n`);
                        
                    } else if (statusStr === 'failed' || statusStr === 'error' || statusStr === 'fail') {
                        const errorMsg = status?.error_message || status?.message || status?.error || status?.data?.message || '生成失败';
                        updateNodeStrictAndSave(node.id, { 
                            _isLoading: false, 
                            _error: errorMsg, 
                            taskId: null,
                            _loadingText: null 
                        });
                        console.error(`❌ [任务失败] 后端判定生成失败:`, errorMsg);
                        console.log(`========================================\n`);
                    } else {
                        // ==========================================
                        // 【核心新增逻辑】：细化进行中的状态提示
                        // ==========================================
                        let statusText = "正在准备..."; 
                        if (statusStr === 'queued') {
                            statusText = "排队中，请耐心等待...";
                        } else if (statusStr === 'processing') {
                            statusText = "正在生成视频...";
                        } else if (statusStr === 'running' || statusStr === 'pending') {
                            statusText = "任务初始化中...";
                        }

                        // 只有当文案发生变化时，才触发更新，避免 React 无意义渲染
                        if (node._loadingText !== statusText) {
                            updateNodeStrictAndSave(node.id, { 
                                _loadingText: statusText 
                            });
                        }

                        console.log(`⏳ [等待中] 状态: "${statusStr}" => UI展示: "${statusText}"`);
                        console.log(`========================================\n`);
                    }
                } catch (e) { 
                    console.error(`❌ [网络/代码异常] 轮询任务 ${node.taskId} 时发生报错:`, e); 
                }
            }
        };

        const timer = setInterval(poll, 3000);
        return () => clearInterval(timer);
    }, [updateNodeStrictAndSave]);
}