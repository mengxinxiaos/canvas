// 可放在 import 语句下方，组件外部
export const CHANGELOG_DATA = [
  {
    version: 'v1.0.6',
    date: '2026-05-26',
    type: 'fix', // feature | fix | optimize
    title: '生成面板bug修复',
    items: [
      '修复调整资产引用会失效的问题',
      
    ]
  },
  {
    version: 'v1.0.5',
    date: '2026-05-25',
    type: 'feature', // feature | fix | optimize
    title: '生成面板更新',
    items: [
      '1.优化资产引用UI',
      '2.增加缩略图预览功能',
      '3.优化prompt区域显示',
    ]
  },
  {
    version: 'v1.0.4',
    date: '2026-05-20',
    type: 'feature', // feature | fix | optimize
    title: '新功能',
    items: [
      '增加了一个sd2.0的api渠道以解决并发少的问题',
    ]
  },
   {
    version: 'v1.0.4',
    date: '2026-05-12',
    type: 'fix', // feature | fix | optimize
    title: 'bug修复',
    items: [
      '修复了裁剪功能在某些情况下失效的问题。',
      '修复了框选框显示问题。',
    ]
  },
  {
    version: 'v1.0.3',
    date: '2026-04-23',
    type: 'optimize', // feature | fix | optimize
    title: 'GPT图像2模型全量支持',
    items: [
      '支持1k,2k,4k直出。',
    ]
  },
  {
    version: 'v1.0.2',
    date: '2026-04-21',
    type: 'feature', // feature | fix | optimize
    title: 'GPT图像2模型更新',
    items: [
      '效果不稳定，建议使用其他模型。',
    ]
  },
  {
    version: 'v1.0.1',
    date: '2026-04-20',
    type: 'feature', // feature | fix | optimize
    title: 'sd2.0模型更新',
    items: [
      '支持1080p直出。',
    ]
  },
  
];

export const TYPE_COLORS = {
  feature: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  fix: 'bg-red-500/20 text-red-400 border-red-500/30',
  optimize: 'bg-green-500/20 text-green-400 border-green-500/30'
};

export const TYPE_LABELS = {
  feature: '新功能',
  fix: '修复',
  optimize: '优化'
};