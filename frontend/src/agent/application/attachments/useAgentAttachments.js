// frontend/src/hooks/agent/useAgentAttachments.js

import { useCallback, useState } from 'react';

export function useAgentAttachments({
    onError,
} = {}) {
    const [isPickingCanvasImages, setIsPickingCanvasImages] = useState(false);
    const [agentAttachments, setAgentAttachments] = useState([]);

    const startPickCanvasImages = useCallback(() => {
        setIsPickingCanvasImages(true);
        onError?.('');
    }, [onError]);

    const stopPickCanvasImages = useCallback(() => {
        setIsPickingCanvasImages(false);
    }, []);

    const clearAgentAttachments = useCallback(() => {
        setAgentAttachments([]);
    }, []);

    const removeAgentAttachment = useCallback((target) => {
        if (!target) return;

        setAgentAttachments((prev) =>
            prev.filter((item) =>
                item.nodeId !== target.nodeId && item.url !== target.url
            )
        );
    }, []);

    const addCanvasImageAttachment = useCallback((node) => {
        if (!node?.src) return false;

        const isImageNode = ['picture', 'image'].includes(node.type);
        if (!isImageNode) return false;

        const url = String(node.src || '').trim();
        if (!url) return false;

        if (url.startsWith('blob:') || url.startsWith('data:')) {
            onError?.('这张图片还不是可访问的远程 URL，需要先上传或保存到媒体库后才能用于识图。');
            return true;
        }

        setAgentAttachments((prev) => {
            const exists = prev.some((item) =>
                item.nodeId === node.id || item.url === url
            );

            if (exists) return prev;

            return [
                ...prev,
                {
                    type: 'image',
                    source: 'canvas',
                    nodeId: node.id,
                    url,
                    name: node.content?.title || node.id,
                },
            ];
        });

        return true;
    }, [onError]);

    return {
        isPickingCanvasImages,
        agentAttachments,

        startPickCanvasImages,
        stopPickCanvasImages,
        clearAgentAttachments,
        removeAgentAttachment,
        addCanvasImageAttachment,
    };
}