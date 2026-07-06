// frontend/src/hooks/agent/agentControllerUtils.js

export const MAX_FRONTEND_TOOL_LOOPS = 6;

export function normalizeMessages(messages = []) {
    return messages
        .filter((msg) => msg && msg.role && typeof msg.content === 'string')
        .map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            attachments: msg.attachments || [],
            status: msg.status,
            frontendActions: msg.frontendActions || [],
            createdAt: msg.createdAt,
        }));
}

export function sortConversations(list = []) {
    return [...list].sort((a, b) => {
        const bt = b.updatedAt || b.createdAt || 0;
        const at = a.updatedAt || a.createdAt || 0;
        return bt - at;
    });
}

export function buildAgentContext({
    user,
    projectId,
    projectName,
    nodes = [],
    edges = [],
    selection = [],
}) {
    const selectedNodes = nodes
        .filter((node) => selection.includes(node.id))
        .slice(0, 5)
        .map((node) => ({
            id: node.id,
            type: node.type,
            content: node.content,
            generation: node.generation,
            hasMedia: Boolean(node.src),
        }));

    return {
        user: {
            id: user?.id,
            username: user?.username,
            displayName: user?.displayName,
        },
        project: {
            id: projectId,
            name: projectName,
        },
        canvas: {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            selectedNodeIds: selection,
            selectedNodes,
        },
    };
}

export function makeLocalMessageId(prefix = 'local') {
    return `${prefix}-${Date.now()}`;
}