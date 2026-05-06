import { useRef } from 'react';
import * as Y from 'yjs';

export function useYjsSandbox(projectId) {
    const yjsRef = useRef(null);

    // 核心改造：不仅判断是否存在，还要判断 projectId 是否发生变化
    if (!yjsRef.current || yjsRef.current.projectId !== projectId) {
        const doc = new Y.Doc();
        yjsRef.current = {
            projectId, // 记录当前属于哪个项目
            doc,
            nodes: doc.getMap('nodes'),
            edges: doc.getMap('edges')
        };
    }

    // 🌟 我们删除了 useEffect 中的 doc.destroy() 逻辑
    // 因为 React 的严格模式会导致文档被误杀。
    // 只要外部的 WebsocketProvider 正常 disconnect，这块内存就会被自动回收。

    return yjsRef.current;
}