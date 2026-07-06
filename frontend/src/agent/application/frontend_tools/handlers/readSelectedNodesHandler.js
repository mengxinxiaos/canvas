// frontend/src/agent/actions/handlers/readSelectedNodesHandler.js

export function createReadSelectedNodesHandler({
    serializeNodeForAgent,
}) {
    return async function handleReadSelectedNodes({ payload, env }) {
        const { nodes, selection } = env;

        const selectedNodeIds = Array.isArray(selection) ? selection : [];
        const selectedNodes = nodes.filter((node) =>
            selectedNodeIds.includes(node.id)
        );

        if (selectedNodes.length === 0) {
            return {
                ok: false,
                error: 'NO_SELECTED_NODE',
                message: '当前画布没有选中任何节点。',
                selectedNodeIds,
                nodes: [],
            };
        }

        return {
            ok: true,
            selectedNodeIds,
            count: selectedNodes.length,
            nodes: selectedNodes.map((node) =>
                serializeNodeForAgent(node, payload)
            ),
        };
    };
}