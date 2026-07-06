// frontend/src/agent/actions/agentActionExecutor.js

export function createAgentActionExecutor({
    handlers,
    env,
}) {
    return async function executeAgentAction(action) {
        if (!action?.command?.type) {
            throw new Error('无效的 Agent action');
        }

        const commandType = action.command.type;
        const handler = handlers[commandType];

        if (!handler) {
            throw new Error(`暂不支持的 Agent action 类型: ${commandType}`);
        }

        return handler({
            action,
            payload: action.command.payload || {},
            env,
        });
    };
}