import { useState, useCallback, useEffect } from 'react';
import { projectService } from '../../services/api';
import { useDebounceCallback } from '../../hooks/common/useDebounce';
import useCanvasStore from '../../store/useCanvasStore';
import { useTaskPolling } from './useTaskPolling';

export function useProjectData(projectId, showToast, yjsInstances) {
    const { doc: sharedYDoc, nodes: sharedYNodes, edges: sharedYEdges } = yjsInstances;
    const [isFirstLoad, setIsFirstLoad] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { initDocument, updateDocState, updateNodeStrict } = useCanvasStore();

    // 1. 首次拉取数据
    const loadProject = useCallback(async () => {
        try { 
            const data = await projectService.fetchProject(projectId); 
            initDocument(data); 

            if (sharedYNodes.size === 0 && data.nodes) {
                sharedYDoc.transact(() => {
                    data.nodes.forEach(node => sharedYNodes.set(node.id, node));
                    if (data.edges) data.edges.forEach(edge => sharedYEdges.set(edge.id, edge));
                });
            }
        } 
        catch (err) { console.error("拉取失败:", err); } 
        finally { setIsFirstLoad(false); }
    }, [projectId, initDocument]);

    useEffect(() => { loadProject(); }, [loadProject]);

    // 2. 防抖存入云端数据库
    // 2. 防抖存入云端数据库 (含强力 Debug 日志)
    const saveToCloudFn = useCallback(async (newData) => {
        setIsSaving(true); 
        
        // 【Debug 1】检查核心参数是否存在
        if (!projectId) {
            console.error("🚨 [SaveToCloud 致命错误]: projectId 为空！无法保存。");
            setIsSaving(false);
            return;
        }

        const payload = { 
            name: newData.name, 
            viewport: newData.viewport, 
            nodes: newData.nodes, 
            edges: newData.edges 
        };

        // 【Debug 2】检查 Payload 的序列化健康度和大小
        try {
            const payloadStr = JSON.stringify(payload);
            console.log(`📦 [SaveToCloud 准备发送]: Payload 大小约 ${(payloadStr.length / 1024).toFixed(2)} KB`);
            console.log("📊 [SaveToCloud 数据概览]:", {
                name: payload.name,
                viewport: payload.viewport,
                nodesCount: payload.nodes?.length,
                edgesCount: payload.edges?.length
            });
        } catch (jsonErr) {
            console.error("🚨 [SaveToCloud 序列化崩溃]: 你的节点或边数据中可能包含了循环引用、DOM 对象或原始的 Yjs 对象！");
            console.error("具体序列化报错:", jsonErr);
            console.dir(payload); // 打印出完整对象供控制台审查
        }

        try {
            // 记录请求发出的时间
            console.time("⏱️ [SaveToCloud 请求耗时]");
            const result = await projectService.saveProject(projectId, payload);
            console.timeEnd("⏱️ [SaveToCloud 请求耗时]");
            
            console.log("✅ [SaveToCloud 保存成功]:", result);

            if (result && result.version) updateDocState({ version: result.version });
        } catch (err) { 
            // 【Debug 3】全方位解剖 Error 对象
            console.group("🚨 [SaveToCloud 接口请求失败]");
            console.error("-> 错误摘要:", err.message);
            
            // 如果你使用的是 Axios，错误详情通常藏在 err.response 里
            if (err.response) {
                console.error("-> 🌩️ HTTP 状态码:", err.response.status);
                console.error("-> 📨 后端返回错误体:", err.response.data);
                console.error("-> 📍 请求 URL:", err.response.config?.url);
            } else if (err.request) {
                // 请求发出去了，但没收到响应 (跨域 CORS / 断网 / 超时)
                console.error("-> 🛑 无响应 (可能为跨域、超时或网络断开):", err.request);
            } else {
                // 设置请求时触发的错误
                console.error("-> ⚙️ Axios/Fetch 设置错误:", err.stack);
            }
            console.groupEnd();

            // 在 Toast 中显示更具体的错误信息以便测试时直观看到
            const errMsg = err.response?.data?.message || err.message || "未知网络错误";
            showToast && showToast(`云端同步失败: ${errMsg}`);
        } finally { 
            setIsSaving(false); 
        }
    }, [projectId, updateDocState, showToast]);

    const saveToCloud = useDebounceCallback(saveToCloudFn, 800);

    // 3. 全局数据更新分发中心
    const dispatchAndSave = useCallback((updater) => {
        const currentState = useCanvasStore.getState();
        const nextState = typeof updater === 'function' ? updater(currentState) : updater;

        if (nextState.nodes || nextState.edges) {
            sharedYDoc.transact(() => {
                if (nextState.nodes) {
                    const pureNodes = JSON.parse(JSON.stringify(nextState.nodes));
                    pureNodes.forEach(n => sharedYNodes.set(n.id, n));
                    const newIds = new Set(pureNodes.map(n => n.id));
                    Array.from(sharedYNodes.keys()).forEach(id => { if (!newIds.has(id)) sharedYNodes.delete(id); });
                }
                if (nextState.edges) {
                    const pureEdges = JSON.parse(JSON.stringify(nextState.edges));
                    pureEdges.forEach(e => sharedYEdges.set(e.id, e));
                    const newEdgeIds = new Set(pureEdges.map(e => e.id));
                    Array.from(sharedYEdges.keys()).forEach(id => { if (!newEdgeIds.has(id)) sharedYEdges.delete(id); });
                }
            });
        }

        const localUpdates = {};
        if (nextState.viewport !== undefined) localUpdates.viewport = nextState.viewport;
        if (nextState.name !== undefined) localUpdates.name = nextState.name;
        if (Object.keys(localUpdates).length > 0) updateDocState(localUpdates);

        saveToCloud(useCanvasStore.getState());
    }, [updateDocState, saveToCloud]);

    // 4. 精准节点更新
    const updateNodeStrictAndSave = useCallback((nodeId, data) => {
        const existing = sharedYNodes.get(nodeId);
        if (existing) {
            const pureData = JSON.parse(JSON.stringify(data));
            sharedYNodes.set(nodeId, { ...existing, ...pureData });
        } else {
            updateNodeStrict(nodeId, data);
        }
        saveToCloud(useCanvasStore.getState());
    }, [updateNodeStrict, saveToCloud]);
    // 开启轮询
    useTaskPolling(updateNodeStrictAndSave);

    return { isFirstLoad, isSaving, dispatchAndSave, updateNodeStrictAndSave, saveToCloud };
}