
import { Type, Cpu, Video } from 'lucide-react';

// ==========================================
// 节点衍生菜单配置 (Edge Derivation Menu)
// ==========================================
// 配置驱动：控制从一个节点拉出连线到空白处时，允许生成的下游节点类型。

export const EDGE_DERIVATION_OPTIONS = [
    {
        type: 'text',
        label: '文本节点',
        description: '添加关联注释或描述',
        icon: Type,
        colorClass: 'bg-neutral-800 text-neutral-400',
        // 判定逻辑：文本节点无门槛，任何情况下都可以衍生
        shouldShow: (srcTypes, isBatch) => true 
    },
    {
        type: 'image',
        label: '图像生成节点',
        description: '将此节点作为参考源',
        icon: Cpu,
        colorClass: 'bg-blue-500/20 text-blue-400',
        // 判定逻辑：只有当来源包含 文本/图片 时才显示，或者在多选批量操作时显示
        shouldShow: (srcTypes, isBatch) => isBatch || srcTypes.some(t => ['text', 'picture', 'image'].includes(t))
    },
    {
        type: 'video',
        label: '视频生成节点',
        description: '宣传视频、动画、电影',
        icon: Video,
        colorClass: 'bg-purple-500/20 text-purple-400',
        // 判定逻辑：同上
        shouldShow: (srcTypes, isBatch) => isBatch || srcTypes.some(t => ['text', 'picture', 'image', 'video', 'video_media'].includes(t))
    }
    
    // 💡 未来扩展示例：如果你之后加了音频生成功能，只需取消下面这段注释即可，UI会自动适配！
    /*
    ,{
        type: 'audio',
        label: '音效/语音节点',
        description: '根据画面或文本生成音效',
        icon: Mic, // 记得在顶部 import Mic
        colorClass: 'bg-green-500/20 text-green-400',
        // 判定逻辑：如果来源是视频或文本，就可以生音频
        shouldShow: (srcTypes, isBatch) => isBatch || srcTypes.some(t => ['video', 'video_media', 'text'].includes(t))
    }
    */
];