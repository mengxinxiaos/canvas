import { create } from 'zustand';
import { generateId, getMediaUrl } from '../utils/helpers';

// ==========================================
// ✅ 数据清洗拦截器：专门用于洗掉云端的历史脏数据
// ==========================================
const cleanNodesData = (nodes) => {
    if (!nodes) return [];
    return nodes.map(n => {
        let updated = { ...n };
        // 强制将所有图片的背景色设定为透明，修复旧节点的黑底遮挡问题
        if (updated.type === 'picture') {
            updated.style = { ...(updated.style || {}), bgColor: 'transparent' };
        }
        // ✅ 修复：确保节点的 src 是正确的 URL 格式
        if (updated.src) {
            updated.src = getMediaUrl(updated.src);
        }
        return updated;
    });
};

const useCanvasStore = create((set, get) => ({
    // ==========================================
    // 1. 核心状态 (State)
    // ==========================================
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [],
    edges: [],
    name: '加载中...',
    version: 0,
    
    // 选中状态
    selection: [],
    
    // 历史记录
    past: [],
    future: [],

    // ==========================================
    // 2. 基础 Action (纯状态修改)
    // ==========================================
    // 初始化/覆盖整个文档状态 (通常在 loadProject 时调用)
    initDocument: (data) => set({ 
        ...data, 
        // ✅ 在数据初始化时，经过清洗器过滤脏数据
        nodes: cleanNodesData(data.nodes), 
        past: [], 
        future: [],
        selection: []
    }),

    // 更新视口
    updateViewport: (updater) => set((state) => ({
        viewport: typeof updater === 'function' ? updater(state.viewport) : { ...state.viewport, ...updater }
    })),

    // 设置选中项
    setSelection: (selection) => set({ selection }),

    // 局部更新
    updateDocState: (updater) => set((state) => {
        const next = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
        // ✅ 任何更新如果有 nodes，也顺手清洗一下确保安全
        if (next.nodes) next.nodes = cleanNodesData(next.nodes);
        return next;
    }),

    // 更新单个节点
    updateNodeStrict: (nodeId, data) => set((state) => ({
        nodes: state.nodes.map(n => n.id === nodeId ? { ...n, ...data } : n)
    })),

    // ==========================================
    // 3. 历史记录系统 (Undo / Redo)
    // ==========================================
    pushHistory: () => set((state) => {
        const snapshot = { nodes: state.nodes, edges: state.edges };
        const newPast = [...state.past, snapshot];
        if (newPast.length > 30) newPast.shift(); // 限制最多 30 步历史
        return { past: newPast, future: [] };
    }),

    undo: () => set((state) => {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        const newPast = state.past.slice(0, -1);
        return {
            past: newPast,
            future: [{ nodes: state.nodes, edges: state.edges }, ...state.future],
            nodes: previous.nodes,
            edges: previous.edges,
            selection: [] // 撤回时清空选中，防止越界
        };
    }),

    redo: () => set((state) => {
        if (state.future.length === 0) return state;
        const next = state.future[0];
        const newFuture = state.future.slice(1);
        return {
            past: [...state.past, { nodes: state.nodes, edges: state.edges }],
            future: newFuture,
            nodes: next.nodes,
            edges: next.edges,
            selection: []
        };
    }),

    // ==========================================
    // 4. 衍生快捷操作 (可选)
    // ==========================================
    // 创建节点
    addNode: (type, position, initialData = {}) => {
        const { pushHistory, updateDocState } = get();
        pushHistory();
        
        let size = { w: 300, h: 300 }; 
        if (type === 'text') size = { w: 260, h: 100 }; 
        if (type === 'video' || type === 'video_media') size = { w: 360, h: 200 }; 
        if (type === 'group') size = { w: 500, h: 400 };
        
        const newNode = { 
            id: generateId(), 
            type, position, 
            size: initialData.size || size, 
            content: type === 'text' ? '' : undefined, 
            src: type !== 'text' ? '' : undefined, 
            ...initialData 
        };
        
        updateDocState(state => ({ nodes: [...state.nodes, newNode], selection: [newNode.id] }));
    }
}));

export default useCanvasStore;