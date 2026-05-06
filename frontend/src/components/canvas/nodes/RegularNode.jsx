//🟢 总入口与状态分发
import React, { memo, useState, useEffect, useMemo } from 'react';
import NodeWrapper from './NodeWrapper';
import TextContent from './content/TextContent';
import ImageContent from './content/ImageContent';
import VideoContent from './content/VideoContent';
import GenPlaceholder from './content/GenPlaceholder';
import TextToolbar from './toolbars/TextToolbar';
import MediaToolbar from './toolbars/MediaToolbar';

const CONTENT_MAP = {
    text: TextContent,
    picture: ImageContent,
    image: GenPlaceholder,
    video: GenPlaceholder,
    video_media: VideoContent
};

const RegularNode = memo((props) => {
    const { node, isSelected, isMultiSelected, isDrawing, isCropping } = props;
    
    // 文本编辑状态需要被 Wrapper (缩放逻辑) 和 TextContent (输入逻辑) 共享
    const [isEditingText, setIsEditingText] = useState(false);

    useEffect(() => {
        if (!isSelected) setIsEditingText(false);
    }, [isSelected]);

    const isText = node.type === 'text';
    const isMedia = ['picture', 'video_media'].includes(node.type);
    const hasStartedGeneration = !!(node.taskId || node.src || node._isLoading || node._error);
    const canRemix = !!(node.generation?.prompt && hasStartedGeneration);
    const isPicture = node.type === 'picture';
    const hasMediaTools = isMedia && !!node.src;
    
    const showMediaToolbar = (canRemix || isPicture || hasMediaTools) && !isText && !isDrawing && !isCropping && !isMultiSelected;
    
    const showTextToolbar = isText && !isMultiSelected;
    
    const ContentComponent = CONTENT_MAP[node.type] || GenPlaceholder;

    // 将增强的 props 传递给子组件
    const enhancedProps = useMemo(() => {
        return { 
            ...props, 
            isEditingText, 
            setIsEditingText, 
            canRemix, 
            isPicture, 
            hasMediaTools 
        };
    }, [
        props, // 注意：如果你的父组件传递进来的 props (比如 actions) 每次都在变，这里依然会被击穿。建议父组件的 actions 也要用 useCallback 包裹。
        isEditingText, 
        canRemix, 
        isPicture, 
        hasMediaTools
    ]);

    return (
        <NodeWrapper {...enhancedProps}>
            {showTextToolbar && <TextToolbar {...enhancedProps} />}
            {showMediaToolbar && <MediaToolbar {...enhancedProps} />}
            <ContentComponent {...enhancedProps} />
        </NodeWrapper>
    );
});

export default RegularNode;