// frontend/src/agent/actions/handlers/createNodeHandler.js

export function createNodeHandler({
    buildAgentCreateNodePayload,
}) {
    return async function handleCreateNode({ action, env }) {
        const {
            screenToCanvas,
            pushHistory,
            dispatchAndSave,
            setSelection,
            showToast,
        } = env;

        const fallbackPosition = screenToCanvas(220, 180);
        const newNode = buildAgentCreateNodePayload(action, fallbackPosition);

        pushHistory();

        dispatchAndSave((doc) => ({
            nodes: [...doc.nodes, newNode],
            edges: doc.edges,
        }));

        setSelection([newNode.id]);

        showToast?.(
            newNode.type === 'video'
                ? 'Agent 已创建视频节点'
                : 'Agent 已创建生图节点'
        );

        return {
            ok: true,
            nodeId: newNode.id,
            nodeType: newNode.type,
            position: newNode.position,
            prompt: newNode.generation?.prompt || '',
        };
    };
}