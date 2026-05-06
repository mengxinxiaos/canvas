// promptBuilder.js
import { IMAGE_STYLES } from '../config/constants';

export const buildPresetPrompt = (content, mode, styleKey) => {
    if (!content) return "";
    
    // 从统一配置中查找风格，找不到则回退到 custom
    const styleConfig = IMAGE_STYLES.find(s => s.value === styleKey) || IMAGE_STYLES[0];
    const styleStr = styleConfig.prompt;
    
    // 如果是标准模式
    if (mode === 'standard') {
        return styleStr ? `${content}\nStyle: ${styleStr}` : content;
    }

    // 四宫格和九宫格的参数配置
    const gridCount = mode === 'four_grid' ? '4' : '9';
    const gridDim = mode === 'four_grid' ? '2x2' : '3x3';
    
    const styleBlock = styleStr ? `<style>\n${styleStr}\n</style>\n` : "";

    return `<role>
You are an award-winning trailer director + cinematographer + storyboard artist. Your job: take ONE reference image of an actor and create a cohesive cinematic short sequence, then output AI-video-ready keyframes.
</role>

<input>
User provides: ${content}
you must use last image as frame proportion.
</input>

<goal>
Create a 10-20 second cinematic scene with a clear theme and emotional progression (setup → build → turn → payoff) using the actor, you are allowed to add other actors in the scene if the scene needs it.
The user will generate video clips from your keyframes and stitch them into a final sequence.
</goal>

${styleBlock}
<steps>
1. a Keyframe List: ${gridCount} frames (later assembled into ONE master grid). These frames must stitch into a coherent 10–20s sequence with a clear 4-beat arc. Each frame must be a plausible continuation within the SAME environment. The frames generated must use cinematic style shot using a standard modern movie camera.
2. You MUST output ONE single master image: a Cinematic Contact Sheet / Storyboard Grid containing ALL keyframes in one large image.
- Default grid: ${gridDim}.
</steps>`;
};