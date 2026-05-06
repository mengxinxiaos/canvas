import React, { useRef, useLayoutEffect, useCallback } from 'react';

function normalizeStrictText(text) {
  return (text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B\u200C\u200D]/g, '')
    .replace(/\uFEFF/g, '');
}

function getPlainTextFromClipboard(e) {
  const plain = e.clipboardData?.getData('text/plain');
  if (plain != null && plain !== '') {
    return normalizeStrictText(plain);
  }

  const html = e.clipboardData?.getData('text/html') || '';
  if (!html) return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return normalizeStrictText(doc.body?.textContent || '');
}

export default function TextContent({
  node,
  isSelected,
  isEditingText,
  setIsEditingText,
  actions
}) {
  const textareaRef = useRef(null);
  const displayRef = useRef(null);
  const measureRef = useRef(null);

  // 记录上次已经提交过的尺寸，避免重复提交同样的更新
  const lastCommittedSizeRef = useRef({
    w: node.size?.w || 200,
    h: node.size?.h || 100
  });

  const defaultStyle = {
    bold: false,
    bgColor: 'transparent',
    color: '#e5e5e5',
    fontSize: 16,
    align: 'left'
  };

  const textStyle = { ...defaultStyle, ...(node.style || {}) };
  
  // 提取公共排版样式
  const sharedTypographyStyle = {
    fontSize: `${textStyle.fontSize}px`,
    fontWeight: textStyle.bold ? 'bold' : 'normal',
    textAlign: textStyle.align,
    color: textStyle.color,
    tabSize: 4,
    whiteSpace: 'pre',
    overflowWrap: 'normal',
    wordBreak: 'normal',
    lineHeight: 1.5,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  };

  const handleTextChange = useCallback(
    (e) => {
      actions.onContentChange(node.id, e.target.value);
    },
    [actions, node.id]
  );

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    const pastedText = getPlainTextFromClipboard(e);
    if (!pastedText) return;

    // 🌟 修改点：使用 execCommand 插入文本。
    // 这会保留浏览器的原生撤销历史栈，并且会自动触发 textarea 的 onChange 事件，
    // 从而自然地通过你的 handleTextChange 更新 React 状态，无需手动计算 cursor。
    document.execCommand('insertText', false, pastedText);
  }, []);
  useLayoutEffect(() => {
    const measureEl = measureRef.current;
    if (!measureEl) return;

    const MIN_WIDTH = 200;
    const MIN_HEIGHT = 100;
    const H_PADDING = 32; // 对应 p-4 左右总 padding
    const V_PADDING = 32; // 对应 p-4 上下总 padding
    const EXTRA_RIGHT_BUFFER = 8;

    const contentWidth = measureEl.scrollWidth;
    const contentHeight = measureEl.scrollHeight;

    const measuredWidth = Math.max(
      MIN_WIDTH,
      Math.ceil(contentWidth + H_PADDING + EXTRA_RIGHT_BUFFER)
    );

    const measuredHeight = Math.max(
      MIN_HEIGHT,
      Math.ceil(contentHeight + V_PADDING)
    );
    // 获取节点当前真实尺寸
    const currentWidth = node.size?.w || MIN_WIDTH;
    const currentHeight = node.size?.h || MIN_HEIGHT;

    // 如果文字太多了，当前框装不下（测量尺寸 > 当前尺寸），才去触发 updateNodeData 把框撑大。
    // 如果当前尺寸足够大（比如用户刚把它拖拽放大了），则什么也不做，保留用户的放大效果。
    if (measuredWidth > currentWidth || measuredHeight > currentHeight) {
      const nextWidth = Math.max(currentWidth, measuredWidth);
      const nextHeight = Math.max(currentHeight, measuredHeight);

      lastCommittedSizeRef.current = { w: nextWidth, h: nextHeight };

      actions.updateNodeData(node.id, {
        size: {
          w: nextWidth,
          h: nextHeight
        }
      });
    } else {
      // 尺寸未超出时，默默同步内部的 ref，防止拖拽松手后再打字时发生判定突变
      lastCommittedSizeRef.current = { w: currentWidth, h: currentHeight };
    }

  }, [
    node.id,
    node.content,
    // 💡 这里必须加入节点当前的宽高作为依赖项
    // 这样外部拖拽导致 node.size 变化时，Effect 能拿到最新的宽高考量标准，不再强制缩回
    node.size?.w,
    node.size?.h,
    textStyle.fontSize,
    textStyle.bold,
    textStyle.align,
    actions
  ]);

  return (
    <div
      className={`w-full h-full relative rounded-2xl overflow-hidden ${
        isSelected
          ? 'ring-2 ring-blue-500 shadow-[0_8px_30px_rgba(0,0,0,0.5)]'
          : 'shadow-lg ring-1 ring-white/10'
      }`}
      style={{ backgroundColor: textStyle.bgColor }}
    >
      {/* 隐藏测量层：专门用于计算真实文本尺寸，避免直接测 textarea 导致宽度异常增长 */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="absolute left-4 top-4 invisible pointer-events-none -z-10"
        style={{
          width: 'max-content',
          minWidth: 0,
          ...sharedTypographyStyle // ✨ 使用展开运算符
        }}
      >
        {node.content && node.content.length > 0 ? node.content : ' '}
      </div>

      <div
        className={`w-full h-full p-4 block ${
          !isEditingText ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditingText(true);
        }}
      >
        {isEditingText ? (
          <textarea
            ref={textareaRef}
            wrap="off"
            spellCheck={false}
            className="text-render-target no-wheel block h-full resize-none outline-none bg-transparent placeholder-white/30 cursor-text overflow-hidden"
            autoFocus
            placeholder="在这里输入文字..."
            value={node.content || ''}
            onChange={handleTextChange}
            onBlur={() => setIsEditingText(false)}
            onPaste={handlePaste}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              minWidth: '100%',
              ...sharedTypographyStyle // ✨ 使用展开运算符
            }}
          />
        ) : (
          <div
            ref={displayRef}
            className="text-render-target block h-full pointer-events-none overflow-hidden"
            style={{
              width: 'max-content',
              minWidth: '100%',
              ...sharedTypographyStyle // ✨ 使用展开运算符
            }}
          >
            {node.content || <span className="text-white/30">双击输入文字...</span>}
          </div>
        )}
      </div>
    </div>
  );
}