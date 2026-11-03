import React, {
    useEffect,
    useRef,
    forwardRef,
    useImperativeHandle,
    useState,
    useCallback
} from 'react';

import {
    useEditor,
    useEditorState,
    EditorContent,
    ReactRenderer,
    NodeViewWrapper,
    ReactNodeViewRenderer
} from '@tiptap/react';

import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';

import { LinkIcon, X } from 'lucide-react';
import { getReferenceType, labelReferenceMedia } from '../../../../utils/referenceMedia.js';
import { syncReferenceMentions } from '../utils/mentionDocument.js';
import { useOverlayContainer } from '../../../ui/OverlayContainerContext.js';
import AssetPreview from './AssetPreview.jsx';

const EMPTY_MEDIA = [];

// ==========================================
// 0. HTML 属性安全转义
// ==========================================
const escapeAttr = (value = '') => {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

// ==========================================
// 纯文本 prompt 转 TipTap HTML
// ==========================================
const parsePromptToHtml = (text, mediaList) => {
    if (!text) return '';

    const mediaMap = new Map(labelReferenceMedia(mediaList).map(media => [media.displayLabel, media]));

    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    html = html.replace(/@([图视音]\d+)/g, (match, label) => {
        const media = mediaMap.get(label);

        if (!media) {
            return match;
        }

        return `<span data-type="mention" data-id="${escapeAttr(media.id)}" data-label="${escapeAttr(label)}" data-src="${escapeAttr(media.src)}" data-media-type="${escapeAttr(media.type)}">@${label}</span>`;
    });

    return html;
};

// ==========================================
// 1. 下拉联想菜单组件
// ==========================================
const MentionList = forwardRef(({ items, command }, ref) => {
    const [selection, setSelection] = useState({ items: items, index: 0 });
    const selectedIndex = selection.items === items ? selection.index : 0;

    const selectItem = useCallback((index) => {
        const item = items[index];

        if (item) {
            command({
                id: item.id,
                label: item.label,
                src: item.src,
                mediaType: item.type,
            });
        }
    }, [items, command]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (!items.length) return false;

            if (event.key === 'ArrowUp') {
                setSelection({
                    items: items,
                    index: (selectedIndex + items.length - 1) % items.length,
                });
                return true;
            }

            if (event.key === 'ArrowDown') {
                setSelection({
                    items: items,
                    index: (selectedIndex + 1) % items.length,
                });
                return true;
            }

            if (event.key === 'Enter') {
                selectItem(selectedIndex);
                return true;
            }

            return false;
        },
    }), [items, selectedIndex, selectItem]);

    if (!items.length) return null;

    return (
        <div className="z-[150] bg-[#2a2a2a] border border-[#444] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden min-w-[180px]">
            <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1f1f1f] border-b border-white/5 flex items-center gap-1.5">
                <LinkIcon size={10} /> 选择关联资产
            </div>

            <div className="max-h-[160px] overflow-y-auto no-wheel">
                {items.map((media, index) => (
                    <button
                        key={media.id || index}
                        onClick={() => selectItem(index)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                            index === selectedIndex
                                ? 'bg-blue-500 text-white'
                                : 'text-neutral-300 hover:bg-[#333]'
                        }`}
                    >
                        {(
                            getReferenceType(media) === 'video'
                        ) ? (
                            <video
                                src={media.src}
                                className="w-6 h-6 rounded-md object-cover border border-black/50"
                                preload="metadata"
                                muted
                                playsInline
                            />
                        ) : getReferenceType(media) === 'audio' ? (
                            <div className="w-6 h-6 rounded-md border border-black/50 flex items-center justify-center bg-neutral-800 text-[10px]">
                                🎵
                            </div>
                        ) : (
                            <img
                                src={media.src}
                                className="w-6 h-6 rounded-md object-cover border border-black/50"
                                alt=""
                            />
                        )}

                        <span className="text-[13px] font-medium">
                            {media.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
});

MentionList.displayName = 'MentionList';

// ==========================================
// 2. 自定义 Mention 胶囊渲染组件
// ==========================================
const MentionNodeView = (props) => {
    const { id, label, src, mediaType } = props.node.attrs;
    const [hover, setHover] = useState(null);

    return (
        <NodeViewWrapper as="span" className="inline-block align-middle mx-1 select-none">
            <span data-mention-preview-trigger
                className="flex items-center gap-1.5 bg-[#171724] border border-[#2a2b44] rounded-[6px] p-1 shadow-sm transition-colors hover:border-[#3a3b54]"
                onMouseEnter={event => setHover({ x: event.clientX, y: event.clientY })}
                onMouseLeave={() => setHover(null)}>
                {(
                    getReferenceType({ type: mediaType }) === 'video'
                ) ? (
                    <video
                        src={src}
                        className="w-5 h-5 rounded-[4px] object-cover pointer-events-none"
                        preload="metadata"
                    />
                ) : getReferenceType({ type: mediaType }) === 'audio' ? (
                    <span className="w-5 h-5 rounded-[4px] bg-neutral-800 flex items-center justify-center text-[10px] pointer-events-none border border-black/30">
                        🎵
                    </span>
                ) : src ? (
                    <img
                        src={src}
                        className="w-5 h-5 rounded-[4px] object-cover pointer-events-none"
                        alt=""
                    />
                ) : null}

                <span className="text-[13px] font-medium text-blue-400 pl-0.5 leading-none">
                    {label}
                </span>

                <button
                    onClick={props.deleteNode}
                    className="ml-0.5 text-neutral-500 hover:text-white hover:bg-white/10 rounded-full p-0.5 transition-all cursor-pointer"
                    contentEditable={false}
                >
                    <X size={12} strokeWidth={2.5} />
                </button>
            </span>
            {hover && src && (
                <AssetPreview media={{ id, src, type: mediaType, displayLabel: label }} x={hover.x} y={hover.y} />
            )}
        </NodeViewWrapper>
    );
};

const CustomMention = Mention.extend({
    addAttributes() {
        return {
            id: {
                default: null,
                parseHTML: element => element.getAttribute('data-id'),
                renderHTML: attributes => ({ 'data-id': attributes.id }),
            },
            label: {
                default: null,
                parseHTML: element => element.getAttribute('data-label'),
                renderHTML: attributes => ({ 'data-label': attributes.label }),
            },
            src: {
                default: null,
                parseHTML: element => element.getAttribute('data-src'),
                renderHTML: attributes => ({ 'data-src': attributes.src }),
            },
            mediaType: {
                default: null,
                parseHTML: element => element.getAttribute('data-media-type'),
                renderHTML: attributes => ({ 'data-media-type': attributes.mediaType }),
            },
        };
    },

    addNodeView() {
        return ReactNodeViewRenderer(MentionNodeView);
    },

    renderText({ node }) {
        return `@${node.attrs.label}`;
    },
});

// ==========================================
// 3. 主输入框组件
// ==========================================
const MentionTextarea = forwardRef(({
    prompt,
    setPrompt,
    mode,
    inputPictures,
    inputMedia,
    onSend,
    expanded = false,

    // 新增：父级拖拽排序后，递增这个 key，强制 TipTap 同步内容
    forceSyncKey = 0,
}, ref) => {
    const getOverlayContainer = useOverlayContainer();
    // An explicitly empty media list must clear stale legacy image references.
    const finalMedia = inputMedia ?? inputPictures ?? EMPTY_MEDIA;

    const latestProps = useRef({
        finalMedia,
        onSend,
        prompt,
        setPrompt,
        getOverlayContainer,
    });

    useEffect(() => {
        latestProps.current = {
            finalMedia,
            onSend,
            prompt,
            setPrompt,
            getOverlayContainer,
        };
    }, [finalMedia, onSend, prompt, setPrompt, getOverlayContainer]);

    const isMenuOpenRef = useRef(false);
    const lastLoadedPromptRef = useRef(null);
    const lastParsedMediaSignatureRef = useRef('');
    const lastForceSyncKeyRef = useRef(forceSyncKey);

    /**
     * 注意：
     * 这里故意不 sort。
     * 因为资产顺序变化时，图1/图2/图3 的编号关系也会变化。
     * 如果 sort，会导致拖拽排序时 signature 不变，Hook A 可能不刷新。
     */
    const currentMediaSignature = finalMedia
        .map(m => `${m.id}:${m.type}:${m.src}`)
        .join('|');

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                codeBlock: false,
                blockquote: false,
                heading: false,
                horizontalRule: false,
                bulletList: false,
                orderedList: false,
            }),

            // TipTap stores these callbacks and invokes them on editor events.
            // eslint-disable-next-line react-hooks/refs
            CustomMention.configure({
                suggestion: {
                    allowedPrefixes: null,

                    items: ({ query }) => {
                        const mediaList = latestProps.current.finalMedia;

                        if (!mediaList || mediaList.length === 0) {
                            return [];
                        }

                        return labelReferenceMedia(mediaList)
                            .map(media => ({ ...media, label: media.displayLabel }))
                            .filter(item => item.label.toLowerCase().includes(query.toLowerCase()));
                    },

                    render: () => {
                        let component;
                        let popup;

                        return {
                            onStart: props => {
                                isMenuOpenRef.current = true;

                                component = new ReactRenderer(MentionList, {
                                    props,
                                    editor: props.editor,
                                });

                                if (!props.clientRect) return;

                                popup = tippy('body', {
                                    getReferenceClientRect: props.clientRect,
                                    appendTo: () => latestProps.current.getOverlayContainer(),
                                    content: component.element,
                                    showOnCreate: true,
                                    interactive: true,
                                    trigger: 'manual',
                                    placement: 'bottom-start',
                                });
                            },

                            onUpdate(props) {
                                component?.updateProps(props);

                                if (!props.clientRect) return;

                                popup?.[0]?.setProps({
                                    getReferenceClientRect: props.clientRect,
                                });
                            },

                            onKeyDown(props) {
                                if (props.event.key === 'Escape') {
                                    popup?.[0]?.hide();
                                    isMenuOpenRef.current = false;
                                    return true;
                                }

                                return component?.ref?.onKeyDown(props);
                            },

                            onExit() {
                                isMenuOpenRef.current = false;
                                popup?.[0]?.destroy();
                                component?.destroy();
                            },
                        };
                    },
                },
            }),
        ],

        content: '',
        immediatelyRender: false,

        editorProps: {
            attributes: {
                class: 'w-full text-[15px] leading-relaxed whitespace-pre-wrap break-all text-neutral-200 cursor-text',
            },

            handleKeyDown: (_view, event) => {
                // 拦截中文输入法 IME，避免 Enter 误发送
                if (event.isComposing || event.keyCode === 229) {
                    return false;
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                    if (isMenuOpenRef.current) {
                        return false;
                    }

                    event.preventDefault();
                    latestProps.current.onSend?.();
                    return true;
                }

                return false;
            },
        },

        onUpdate: ({ editor }) => {
            const plainText = editor.getText();

            lastLoadedPromptRef.current = plainText;

            // Keep the parent's prompt ref current before a following Enter key
            // can submit; deferring this write can reapply an older editor snapshot.
            latestProps.current.setPrompt(plainText);
        },
    });

    // Prompt replacement and ID-based mention reconciliation share one transaction
    // sequence. Cancel stale queued work when a newer prop snapshot arrives.
    useEffect(() => {
        if (!editor) return;
        let cancelled = false;

        queueMicrotask(() => {
            if (cancelled || editor.isDestroyed) return;
            const isPromptChanged = lastLoadedPromptRef.current !== prompt;
            const isMediaChanged = lastParsedMediaSignatureRef.current !== currentMediaSignature;
            const shouldForceSync = lastForceSyncKeyRef.current !== forceSyncKey;

            if (!isPromptChanged && !isMediaChanged && !shouldForceSync) return;

            if (isPromptChanged || shouldForceSync) {
                const { from, to } = editor.state.selection;
                editor.chain()
                    .setContent(parsePromptToHtml(prompt, finalMedia), { emitUpdate: false })
                    .command(({ tr }) => {
                        tr.setMeta('addToHistory', false);
                        return true;
                    })
                    .run();
                if (editor.isFocused) {
                    const maxPosition = editor.state.doc.content.size;
                    editor.commands.setTextSelection({
                        from: Math.min(from, maxPosition),
                        to: Math.min(to, maxPosition),
                    });
                }
                lastLoadedPromptRef.current = prompt;
            }

            if (isMediaChanged) {
                const transaction = syncReferenceMentions(editor.state.tr, finalMedia);
                if (transaction.docChanged) {
                    editor.view.dispatch(transaction.setMeta('addToHistory', false));
                }
            }

            lastParsedMediaSignatureRef.current = currentMediaSignature;
            lastForceSyncKeyRef.current = forceSyncKey;
        });

        return () => { cancelled = true; };
    }, [prompt, finalMedia, editor, currentMediaSignature, forceSyncKey]);

    // 向外暴露给 PictureTags 调用的插入方法
    useImperativeHandle(ref, () => ({
        insertMention: (media) => {
            if (!editor) return;

            editor
                .chain()
                .focus()
                .insertContent({
                    type: 'mention',
                    attrs: {
                        id: media.id,
                        label: media.displayLabel,
                        src: media.src,
                        mediaType: media.type,
                    },
                })
                .insertContent(' ')
                .run();
        },
    }), [editor]);

    const isEditorEmpty = useEditorState({
        editor,
        selector: ({ editor: currentEditor }) => currentEditor?.isEmpty ?? true,
    });

    if (!editor) return null;

    return (
        <div className={`px-1 relative w-full min-h-0 border-none ${expanded ? 'flex h-full flex-col' : 'mb-4'}`}>
            <div className={expanded ? 'shrink-0 mb-3 text-xs text-neutral-400' : 'hidden'}>提示词</div>
            <div className={`relative min-h-0 ${expanded ? 'flex-1' : ''}`}>
                {isEditorEmpty && (
                    <div className="absolute top-0 left-0 pointer-events-none text-neutral-500 text-[15px] leading-relaxed">
                        {mode === 'image'
                            ? '描述你想生成的画面 (输入 @ 引用资产)...'
                            : '描述你想生成的视频内容 (输入 @ 引用资产)...'}
                    </div>
                )}

                <EditorContent
                    editor={editor}
                    className={`no-wheel [&>.ProseMirror]:overflow-y-auto [&>.ProseMirror]:outline-none [&>.ProseMirror]:p-0 ${expanded
                        ? 'h-full min-h-0 [&>.ProseMirror]:h-full [&>.ProseMirror]:min-h-0 [&>.ProseMirror]:max-h-none'
                        : '[&>.ProseMirror]:min-h-[48px] [&>.ProseMirror]:max-h-[min(180px,25dvh)]'}`}
                />
            </div>
        </div>
    );
});

MentionTextarea.displayName = 'MentionTextarea';

export default MentionTextarea;
