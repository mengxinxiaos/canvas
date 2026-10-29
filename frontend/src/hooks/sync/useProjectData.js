import { useState, useCallback, useEffect, useRef } from 'react';
import { projectService } from '../../services/api';
import { useDebounceCallback } from '../../hooks/common/useDebounce';
import useCanvasStore from '../../store/useCanvasStore';
import { useTaskPolling } from './useTaskPolling';

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMergePatch(base, patch) {
    const result = { ...(base || {}) };

    Object.entries(patch || {}).forEach(([key, value]) => {
        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = deepMergePatch(result[key], value);
        } else {
            result[key] = value;
        }
    });

    return result;
}

export function useProjectData(projectId, showToast, yjsInstances, shareToken) {
    const { doc: sharedYDoc, nodes: sharedYNodes, edges: sharedYEdges } = yjsInstances;
    const [isFirstLoad, setIsFirstLoad] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { initDocument, updateDocState, updateNodeStrict } = useCanvasStore();
    const versionRef = useRef(0);

    // 1. 首次拉取数据
    // 1. 首次拉取数据
    const loadProject = useCallback(async () => {
        try {
            const data = await projectService.fetchProject(projectId, shareToken);

            versionRef.current = data.version ?? 0;
            initDocument(data);

            if (sharedYNodes.size === 0 && data.nodes) {
                sharedYDoc.transact(() => {
                    data.nodes.forEach((node) => sharedYNodes.set(node.id, node));

                    if (data.edges) {
                        data.edges.forEach((edge) => sharedYEdges.set(edge.id, edge));
                    }
                });
            }
        } catch (err) {
            console.error("拉取失败:", err);
        } finally {
            setIsFirstLoad(false);
        }
    }, [
        projectId,
        shareToken,
        initDocument,
        sharedYDoc,
        sharedYNodes,
        sharedYEdges,
    ]);

    useEffect(() => {
        loadProject();
    }, [loadProject]);

    // 2. 防抖存入云端数据库
    // 2. 防抖存入云端数据库 (含强力 Debug 日志)
    const saveToCloudFn = useCallback(async (newData) => {
        setIsSaving(true);

        if (!projectId) {
            console.error("🚨 [SaveToCloud 致命错误]: projectId 为空！无法保存。");
            setIsSaving(false);
            return;
        }

        const currentVersion = versionRef.current;

        if (currentVersion === undefined || currentVersion === null) {
            console.error("🚨 [SaveToCloud 致命错误]: version 为空，无法保存。", {
                versionRef: versionRef.current,
                newData,
            });
            showToast && showToast("保存失败：缺少项目版本号，请刷新项目后重试");
            setIsSaving(false);
            return;
        }

        const payload = {
            name: newData.name,
            viewport: newData.viewport,
            nodes: newData.nodes,
            edges: newData.edges,
            version: currentVersion,
        };

        try {
            const timerName = `⏱️ [SaveToCloud 请求耗时] ${Date.now()}`;
            console.time(timerName);

            const result = await projectService.saveProject(projectId, payload, shareToken);

            console.timeEnd(timerName);

            console.log("✅ [SaveToCloud 保存成功]:", result);

            if (result && result.version !== undefined && result.version !== null) {
                versionRef.current = result.version;
                updateDocState({ version: result.version });
            }
        } catch (err) {
            console.group("🚨 [SaveToCloud 接口请求失败]");
            console.error("-> 错误摘要:", err.message);
            console.error("-> 当前 versionRef:", versionRef.current);
            console.error("-> 本次 payload.version:", payload.version);
            console.groupEnd();

            const errMsg = err.response?.data?.message || err.message || "未知网络错误";
            showToast && showToast(`云端同步失败: ${errMsg}`);
        } finally {
            setIsSaving(false);
        }
    }, [projectId, shareToken, updateDocState, showToast]);

    const saveToCloud = useDebounceCallback(saveToCloudFn, 800);

    // 3. 全局数据更新分发中心
    const dispatchAndSave = useCallback((updater) => {
        const currentState = useCanvasStore.getState();
        const nextPatch = typeof updater === 'function'
            ? updater(currentState)
            : updater;

        const nextSnapshot = {
            ...currentState,
            ...nextPatch,
            nodes: nextPatch.nodes ?? currentState.nodes,
            edges: nextPatch.edges ?? currentState.edges,
            viewport: nextPatch.viewport ?? currentState.viewport,
            name: nextPatch.name ?? currentState.name,
            version: currentState.version,
        };

        if (nextPatch.nodes || nextPatch.edges) {
            sharedYDoc.transact(() => {
                if (nextPatch.nodes) {
                    const pureNodes = JSON.parse(JSON.stringify(nextPatch.nodes));
                    pureNodes.forEach((node) => sharedYNodes.set(node.id, node));

                    const newIds = new Set(pureNodes.map((node) => node.id));
                    Array.from(sharedYNodes.keys()).forEach((id) => {
                        if (!newIds.has(id)) sharedYNodes.delete(id);
                    });
                }

                if (nextPatch.edges) {
                    const pureEdges = JSON.parse(JSON.stringify(nextPatch.edges));
                    pureEdges.forEach((edge) => sharedYEdges.set(edge.id, edge));

                    const newEdgeIds = new Set(pureEdges.map((edge) => edge.id));
                    Array.from(sharedYEdges.keys()).forEach((id) => {
                        if (!newEdgeIds.has(id)) sharedYEdges.delete(id);
                    });
                }
            });
        }

        const localUpdates = {};
        if (nextPatch.viewport !== undefined) localUpdates.viewport = nextPatch.viewport;
        if (nextPatch.name !== undefined) localUpdates.name = nextPatch.name;

        if (Object.keys(localUpdates).length > 0) {
            updateDocState(localUpdates);
        }

        saveToCloud(nextSnapshot);
    }, [updateDocState, saveToCloud, sharedYDoc, sharedYNodes, sharedYEdges]);

    // 4. 精准节点更新
    const updateNodeStrictAndSave = useCallback((nodeId, data) => {
        const currentState = useCanvasStore.getState();
        const existingFromYjs = sharedYNodes.get(nodeId);
        const existingFromStore = currentState.nodes.find((node) => node.id === nodeId);

        const existing = existingFromYjs || existingFromStore;

        if (!existing) {
            console.warn('[updateNodeStrictAndSave] node not found:', nodeId);
            return;
        }

        const pureData = JSON.parse(JSON.stringify(data));
        const updatedNode = deepMergePatch(existing, pureData);

        const nextNodes = currentState.nodes.map((node) =>
            node.id === nodeId ? updatedNode : node
        );

        sharedYNodes.set(nodeId, JSON.parse(JSON.stringify(updatedNode)));

        // 关键：必须同步更新本地 Zustand，否则当前 UI 不会立刻刷新
        updateDocState({
            nodes: nextNodes,
        });

        saveToCloud({
            ...currentState,
            nodes: nextNodes,
            version: currentState.version,
        });
       
        /*
        console.group('[AgentDebug] updateNodeStrictAndSave committed');
        console.log('nodeId:', nodeId);
        console.log('patch:', pureData);
        console.log('updated generation:', updatedNode.generation);
        console.log('updated content:', updatedNode.content);
        console.groupEnd();
        */
    }, [
        updateDocState,
        saveToCloud,
        sharedYNodes,
    ]);
    // 开启轮询
    useTaskPolling(updateNodeStrictAndSave, shareToken);

    return { isFirstLoad, isSaving, dispatchAndSave, updateNodeStrictAndSave, saveToCloud };
}
