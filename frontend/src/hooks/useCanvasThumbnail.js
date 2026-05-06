import { useState } from 'react';
import html2canvas from 'html2canvas';
import { projectService } from '../services/api';

export const useCanvasThumbnail = (projectId, containerRef) => {
    const [isGeneratingThumb, setIsGeneratingThumb] = useState(false);

    const generateAndSaveThumbnail = async (onComplete) => {
        // 如果没有 ref，直接执行回调（兜底逻辑）
        if (!containerRef.current) {
            if (onComplete) onComplete();
            return;
        }

        setIsGeneratingThumb(true);
        try {
            // 对当前视口进行快照
            const canvas = await html2canvas(containerRef.current, {
                scale: 0.5, // 缩略图不需要太高清，0.5 倍即可
                useCORS: true, // 允许加载跨域图片
                backgroundColor: '#0a0a0a',
                // 核心剔除逻辑：只拍画布内容，不拍 UI 控制台
                ignoreElements: (element) => {
                    const classList = element.classList;
                    return classList.contains('z-[100]') || // 顶部/底部工具栏
                           classList.contains('z-[200]') || // 协同光标
                           classList.contains('z-[250]') || // 多选工具栏
                           classList.contains('z-[300]') || // 预览弹窗/衍生菜单
                           element.id === 'fast-selection-box' ||
                           element.id === 'multi-selection-box';
                }
            });

            // 转换为低画质的 JPEG Base64 字符串
            const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.6);

            // 静默保存到数据库
            await projectService.updateProject(projectId, { thumbnail: thumbnailBase64 });
        } catch (err) {
            console.error('画布缩略图生成失败:', err);
        } finally {
            setIsGeneratingThumb(false);
            // 无论截图成功与否，最终都要执行回调（比如退出画布）
            if (onComplete) onComplete(); 
        }
    };

    return { 
        isGeneratingThumb, 
        generateAndSaveThumbnail 
    };
};