// frontend/src/agent/actions/handlers/updateSelectedNodeHandler.js

export function createUpdateSelectedNodeHandler({
    buildPatchFromEditableOperations,
    cloneJson,
    deepMergePatch,
    pickSavablePatch,
}) {
    return async function handleUpdateSelectedNode({ payload, env }) {
        const {
            nodes,
            selection,
            pushHistory,
            dispatchAndSave,
            updateNodeStrictAndSave,
            showToast,
        } = env;

        const selectedNodeIds = Array.isArray(selection) ? selection : [];

        if (selectedNodeIds.length === 0) {
            return {
                ok: false,
                error: 'NO_SELECTED_NODE',
                message: '当前画布没有选中任何节点，无法修改。',
            };
        }

        const targetMode = payload.targetMode || 'single_selected';

        if (targetMode === 'single_selected' && selectedNodeIds.length > 1) {
            return {
                ok: false,
                error: 'MULTIPLE_SELECTED_NODES',
                message: '当前选中了多个节点。如果要批量修改，请明确使用 all_selected。',
                selectedNodeIds,
            };
        }

        const operations = Array.isArray(payload.operations)
            ? payload.operations
            : [];

        if (operations.length === 0) {
            return {
                ok: false,
                error: 'EMPTY_OPERATIONS',
                message: 'operations 不能为空。请先读取 editableFields，再指定要修改的 path 和 value。',
            };
        }

        const targetIds = targetMode === 'all_selected'
            ? selectedNodeIds
            : [selectedNodeIds[0]];

        const targetNodes = nodes.filter((node) =>
            targetIds.includes(node.id)
        );

        if (targetNodes.length === 0) {
            return {
                ok: false,
                error: 'SELECTED_NODE_NOT_FOUND',
                message: '选中的节点不存在，可能已经被删除。',
                selectedNodeIds,
            };
        }

        const results = [];

        for (const node of targetNodes) {
            const built = buildPatchFromEditableOperations(node, operations);

            if (!built.ok) {
                return {
                    ok: false,
                    nodeId: node.id,
                    nodeType: node.type,
                    ...built,
                };
            }

            results.push({
                node,
                patch: built.patch,
            });
        }

        const validResults = results.filter((item) =>
            Object.keys(item.patch || {}).length > 0
        );

        if (validResults.length === 0) {
            return {
                ok: false,
                error: 'EMPTY_PATCH',
                message: '没有生成任何有效修改。',
            };
        }

        pushHistory();

        if (
            validResults.length === 1 &&
            typeof updateNodeStrictAndSave === 'function'
        ) {
            const { node, patch } = validResults[0];
            const safePatch = pickSavablePatch(node, patch);

            updateNodeStrictAndSave(
                node.id,
                cloneJson(safePatch),
            );
        } else {
            const patchMap = new Map(
                validResults.map(({ node, patch }) => [node.id, patch])
            );

            dispatchAndSave((doc) => ({
                nodes: doc.nodes.map((node) => {
                    const patch = patchMap.get(node.id);

                    return patch
                        ? deepMergePatch(node, cloneJson(patch))
                        : node;
                }),
                edges: doc.edges,
            }));
        }

        showToast?.(
            validResults.length > 1
                ? `Agent 已修改 ${validResults.length} 个选中节点`
                : 'Agent 已修改当前选中节点'
        );

        return {
            ok: true,
            targetMode,
            updatedCount: validResults.length,
            updatedNodes: validResults.map(({ node, patch }) => ({
                nodeId: node.id,
                nodeType: node.type,
                updatedFields: operations.map((item) => item.path),
                patch,
            })),
        };
    };
}