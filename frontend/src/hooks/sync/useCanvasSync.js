import { useEffect, useRef, useState, useCallback } from 'react';
import { WebsocketProvider } from 'y-websocket';
import useCanvasStore from '../../store/useCanvasStore';

const YJS_SERVER_URL = import.meta.env.VITE_YJS_WS_URL;

// 光标备选颜色池
const CURSOR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef'];

// 注意这里多接收了一个 user 参数，用来展示名字
export function useCanvasSync(projectId, user, showToast, yjsInstances) {
    const { updateDocState } = useCanvasStore();

    const { doc: sharedYDoc, nodes: sharedYNodes, edges: sharedYEdges } = yjsInstances;
    
    const providerRef = useRef(null);
    
    // 存储房间里其他人的状态（光标位置、颜色、名字）
    const [others, setOthers] = useState([]);

    // 维护当前的 WebSocket 连接状态 (默认 connecting)
    const [syncStatus, setSyncStatus] = useState('connecting');

    useEffect(() => {
        if (!projectId) return;

        const roomName = `tapnow-project-${projectId}`;
        const provider = new WebsocketProvider(YJS_SERVER_URL, roomName, sharedYDoc);
        providerRef.current = provider;

        // ================= Phase 3 核心：感知模块 =================
        const awareness = provider.awareness;
        const myColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

        // 1. 设置自己的初始身份
        awareness.setLocalStateField('user', {
            name: user?.displayName || user?.username || '匿名用户',
            color: myColor,
            cursor: null // 初始不显示光标
        });

        // 2. 监听别人状态的变化
        awareness.on('change', () => {
            // 💡 史诗级优化核心：
            // 如果这次 change 事件纯粹是因为“我自己”移动了光标触发的（origin === 'local'）
            // 直接 return！绝对不要去触发 setOthers()，从而彻底阻断整个大画布的无辜重绘！
            if (origin === 'local' && added.length === 0 && removed.length === 0 && updated.length === 1 && updated[0] === awareness.clientID) {
                return; 
            }
            
            const states = Array.from(awareness.getStates().entries());
            const othersList = [];
            states.forEach(([clientId, state]) => {
                // 过滤掉自己，只保留有完整 user 数据且在画布上移动的人
                if (clientId !== awareness.clientID && state.user && state.user.cursor) {
                    othersList.push({ clientId, ...state.user });
                }
            });
            setOthers(othersList);
        });
        // =========================================================

        provider.on('status', event => {
            setSyncStatus(event.status);
        });

        const handleNodesChange = () => { updateDocState({ nodes: Object.values(sharedYNodes.toJSON()) }); };
        const handleEdgesChange = () => { updateDocState({ edges: Object.values(sharedYEdges.toJSON()) }); };

        sharedYNodes.observe(handleNodesChange);
        sharedYEdges.observe(handleEdgesChange);

        return () => {
            sharedYNodes.unobserve(handleNodesChange);
            sharedYEdges.unobserve(handleEdgesChange);
            provider.disconnect();
        };
    },[projectId, updateDocState, showToast, user, sharedYDoc, sharedYNodes, sharedYEdges]);

    // 【新增】：向外界暴露一个更新自己光标位置的方法
    const updateMyCursor = useCallback((x, y) => {
        if (providerRef.current && providerRef.current.awareness) {
            const awareness = providerRef.current.awareness;
            const localUser = awareness.getLocalState()?.user;
            if (localUser) {
                // 将光标位置广播给房间里的所有人
                awareness.setLocalStateField('user', { ...localUser, cursor: { x, y } });
            }
        }
    }, []);

    // 【新增】：鼠标离开画布时，隐藏自己的光标
    const removeMyCursor = useCallback(() => {
        if (providerRef.current && providerRef.current.awareness) {
            const awareness = providerRef.current.awareness;
            const localUser = awareness.getLocalState()?.user;
            if (localUser) awareness.setLocalStateField('user', { ...localUser, cursor: null });
        }
    }, []);

    return { others, updateMyCursor, removeMyCursor, syncStatus };
}