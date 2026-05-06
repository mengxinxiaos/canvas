import { taskService } from './api';
import { IMAGE_MODELS, VIDEO_MODELS } from '../config/constants';

//const VALID_MEDIA_TYPES = ['picture', 'image', 'video', 'video_media', 'video_node', 'audio'];
const VALID_MEDIA_TYPES = ['picture', 'image'];
// 纯函数：不再依赖 React 环境的 state 和 hook
export const aiGenerationService = {
    async submitTask({ projectId, genParams, canvasState, updateNodeStrictAndSave, pushHistory, showToast }) {
        const generatorNode = canvasState.nodes.find(n => n.id === genParams.nodeId);
        if (!generatorNode || generatorNode._isLoading) return;
        
        let inputs = genParams.inputs;
        // 🛡️ 兜底逻辑：如果面板没传，只抓取 "连入(to)" 的节点，严禁抓取 "连出(from)" 的节点
        if (!inputs || inputs.length === 0) {
            inputs = canvasState.edges
                .filter(e => e.to === generatorNode.id) // 👈 核心修复：只看入边
                .map(e => canvasState.nodes.find(n => n.id === e.from))
                .filter(Boolean)
                .filter(n => VALID_MEDIA_TYPES.includes(n.type))
                .map(n => {
                    let baseType = 'image';
                    if (n.type.includes('video')) baseType = 'video';
                    if (n.type.includes('audio')) baseType = 'audio';
                    return { url: n.src, type: baseType };
                })
                .filter(media => Boolean(media.url));
        }

        //const BASE_URL = window.location.origin; 
        const BASE_URL = 'https://ai-other-01.oss-cn-hangzhou.aliyuncs.com'; 
        if (genParams.gridMode === 'four_grid' && genParams.aspectRatio === '9:16') {
            inputs.push({ url: `${BASE_URL}/templates/four_grid_9_16_template.png`, type: 'image' });
        } else if (genParams.gridMode === 'nine_grid' && genParams.aspectRatio === '9:16') {
            inputs.push({ url: `${BASE_URL}/templates/nine_grid_9_16_template.png`, type: 'image' });
        }

        // 根据当前选中的 model，自动查出对应的 provider
        const allModels = generatorNode.type === 'video' ? VIDEO_MODELS : IMAGE_MODELS;
        const selectedModelInfo = allModels.find(m => m.value === genParams.model);
        const provider = selectedModelInfo ? selectedModelInfo.provider : 'zhenzhen'; // 找不到默认给 zhenzhen

        pushHistory();
        updateNodeStrictAndSave(generatorNode.id, { _isLoading: true, generation: { ...genParams }, _error: null });
        
        try {
            const finalPayload = { 
                projectId, 
                nodeId: generatorNode.id, 
                ...genParams, 
                provider, 
                mode: genParams.apiMode, 
                inputs 
            };

            const result = await (
                generatorNode.type === 'video' 
                ? taskService.createVideoTask(finalPayload) 
                : taskService.createImageTask(finalPayload)
            );
                
            if (!result || !result.taskId) {
                console.error(`❌ [致命错误]: 后端返回成功，但找不到 taskId!`);
                showToast("创建任务失败：未拿到任务号");
                updateNodeStrictAndSave(generatorNode.id, { _isLoading: false, _error: "服务器未返回任务号" });
                return;
            }
            updateNodeStrictAndSave(generatorNode.id, { taskId: result.taskId });
        } catch (err) { 
            updateNodeStrictAndSave(generatorNode.id, { _isLoading: false, _error: err.message }); 
        }
    }
};