import React, {
    useEffect,
    useRef,
    forwardRef,
    useImperativeHandle,
    useState
} from 'react';

import {
    useEditor,
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

    let imgCount = 0;
    let vidCount = 0;
    let audCount = 0;

    const mediaMap = {};

    mediaList.forEach((media) => {
        let prefix = '图';
        let num = 0;

        if (
            media.type === 'video' ||
            media.type === 'video_media' ||
            media.type === 'video_node'
        ) {
            prefix = '视';
            num = ++vidCount;
        } else if (media.type === 'audio') {
            prefix = '音';
            num = ++audCount;
        } else {
            prefix = '图';
            num = ++imgCount;
        }

        const label = `${prefix}${num}`;

        mediaMap[label] = {
            id: media.id,
            src: media.src,
            type: media.type,
        };
    });

    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

    html = html.replace(/@([图视音]\d+)/g, (match, label) => {
        const media = mediaMap[label];

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
const MentionList = forwardRef((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        setSelectedIndex(0);
    }, [props.items]);

    const selectItem = (index) => {
        const item = props.items[index];

        if (item) {
            props.command({
                id: item.id,
                label: item.label,
                src: item.src,
                mediaType: item.type,
            });
        }
    };

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (!props.items.length) return false;

            if (event.key === 'ArrowUp') {
                setSelectedIndex(prev =>
                    (prev + props.items.length - 1) % props.items.length
                );
                return true;
            }

            if (event.key === 'ArrowDown') {
                setSelectedIndex(prev =>
                    (prev + 1) % props.items.length
                );
                return true;
            }

            if (event.key === 'Enter') {
                selectItem(selectedIndex);
                return true;
            }

            return false;
        },
    }), [props.items, selectedIndex]);

    if (!props.items.length) return null;

    return (
        <div className="z-[150] bg-[#2a2a2a] border border-[#444] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden min-w-[180px]">
            <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider bg-[#1f1f1f] border-b border-white/5 flex items-center gap-1.5">
                <LinkIcon size={10} /> 选择关联资产
            </div>

            <div className="max-h-[160px] overflow-y-auto no-wheel">
                {props.items.map((media, index) => (
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
                            media.type === 'video' ||
                            media.type === 'video_media' ||
                            media.type === 'video_node'
                        ) ? (
                            <video
                                src={media.src}
                                className="w-6 h-6 rounded-md object-cover border border-black/50"
                                preload="metadata"
                                muted
                                playsInline
                                crossOrigin="anonymous"
                            />
                        ) : media.type === 'audio' ? (
                            <div className="w-6 h-6 rounded-md border border-black/50 flex items-center justify-center bg-neutral-800 text-[10px]">
                                🎵
                            </div>
                        ) : (
                            <img
                                src={media.src}
                                className="w-6 h-6 rounded-md object-cover border border-black/50"
                                crossOrigin="anonymous"
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
    const { label, src, mediaType } = props.node.attrs;

    return (
        <NodeViewWrapper as="span" className="inline-block align-middle mx-1 select-none">
            <span className="flex items-center gap-1.5 bg-[#171724] border border-[#2a2b44] rounded-[6px] p-1 shadow-sm transition-colors hover:border-[#3a3b54]">
                {(
                    mediaType === 'video' ||
                    mediaType === 'video_media' ||
                    mediaType === 'video_node'
                ) ? (
                    <video
                        src={src}
                        className="w-5 h-5 rounded-[4px] object-cover pointer-events-none"
                        preload="metadata"
                    />
                ) : mediaType === 'audio' ? (
                    <span className="w-5 h-5 rounded-[4px] bg-neutral-800 flex items-center justify-center text-[10px] pointer-events-none border border-black/30">
                        🎵
                    </span>
                ) : src ? (
                    <img
                        src={src}
                        className="w-5 h-5 rounded-[4px] object-cover pointer-events-none"
                        crossOrigin="anonymous"
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

    // 新增：父级拖拽排序后，递增这个 key，强制 TipTap 同步内容
    forceSyncKey = 0,
}, ref) => {
    // 严谨 fallback：inputMedia 有内容则优先，否则使用 inputPictures
    const finalMedia = inputMedia?.length ? inputMedia : (inputPictures || []);

    const latestProps = useRef({
        finalMedia,
        onSend,
        prompt,
    });

    useEffect(() => {
        latestProps.current = {
            finalMedia,
            onSend,
            prompt,
        };
    }, [finalMedia, onSend, prompt]);

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

            CustomMention.configure({
                suggestion: {
                    allowedPrefixes: null,

                    items: ({ query }) => {
                        const mediaList = latestProps.current.finalMedia;

                        if (!mediaList || mediaList.length === 0) {
                            return [];
                        }

                        let imgCount = 0;
                        let vidCount = 0;
                        let audCount = 0;

                        return mediaList
                            .map((media) => {
                                let prefix = '图';
                                let num = 0;

                                if (
                                    media.type === 'video' ||
                                    media.type === 'video_media' ||
                                    media.type === 'video_node'
                                ) {
                                    prefix = '视';
                                    num = ++vidCount;
                                } else if (media.type === 'audio') {
                                    prefix = '音';
                                    num = ++audCount;
                                } else {
                                    prefix = '图';
                                    num = ++imgCount;
                                }

                                return {
                                    ...media,
                                    label: `${prefix}${num}`,
                                };
                            })
                            .filter(item =>
                                item.label.toLowerCase().includes(query.toLowerCase())
                            );
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
                                    appendTo: () => document.body,
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

            handleKeyDown: (view, event) => {
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

            queueMicrotask(() => {
                if (editor.isDestroyed) return;

                setPrompt(prev => {
                    return prev === plainText ? prev : plainText;
                });
            });
        },
    });

    // ==========================================
    // Hook A：父级 prompt / 媒体顺序变化后的内容重绘
    // ==========================================
    useEffect(() => {
        if (!editor) return;

        const isPromptChanged = lastLoadedPromptRef.current !== prompt;
        const isMediaChanged = lastParsedMediaSignatureRef.current !== currentMediaSignature;
        const shouldForceSync = lastForceSyncKeyRef.current !== forceSyncKey;

        if (!isPromptChanged && !isMediaChanged && !shouldForceSync) {
            return;
        }

        const htmlContent = parsePromptToHtml(prompt, finalMedia);

        queueMicrotask(() => {
            if (editor.isDestroyed) return;

            /**
             * 普通外部更新：
             * - 编辑器 focus 时不要打断用户输入。
             *
             * 强制同步：
             * - 拖拽资产排序后，prompt 已经被父级重映射。
             * - 此时必须刷新 TipTap 内容，否则 UI 里还显示旧 @图N。
             */
            if (editor.isFocused && !shouldForceSync) {
                return;
            }

            editor.commands.setContent(htmlContent, {
                emitUpdate: false,
            });

            lastLoadedPromptRef.current = prompt;
            lastParsedMediaSignatureRef.current = currentMediaSignature;
            lastForceSyncKeyRef.current = forceSyncKey;
        });
    }, [
        prompt,
        finalMedia,
        editor,
        currentMediaSignature,
        forceSyncKey
    ]);

    // ==========================================
    // Hook B：Mention 节点属性同步器
    // 响应资产 src/type/label 变化
    // ==========================================
    useEffect(() => {
        if (!editor) return;

        queueMicrotask(() => {
            if (editor.isDestroyed) return;

            const idToMediaMap = {};

            let imgCount = 0;
            let vidCount = 0;
            let audCount = 0;

            finalMedia.forEach((media) => {
                let prefix = '图';
                let num = 0;

                if (
                    media.type === 'video' ||
                    media.type === 'video_media' ||
                    media.type === 'video_node'
                ) {
                    prefix = '视';
                    num = ++vidCount;
                } else if (media.type === 'audio') {
                    prefix = '音';
                    num = ++audCount;
                } else {
                    prefix = '图';
                    num = ++imgCount;
                }

                idToMediaMap[media.id] = {
                    label: `${prefix}${num}`,
                    src: media.src,
                    mediaType: media.type,
                };
            });

            const tr = editor.state.tr;
            let shouldDispatch = false;

            editor.state.doc.descendants((node, pos) => {
                if (node.type.name !== 'mention') return;

                const currentId = node.attrs.id;
                const correctMedia = idToMediaMap[currentId];

                if (!correctMedia) {
                    shouldDispatch = true;
                    
                    // 删除失效 mention 节点，避免旧 @图N 误绑定到新的资产
                    tr.delete(pos, pos + node.nodeSize);
                    return; 
                }

                const isLabelChanged = node.attrs.label !== correctMedia.label;
                const isSrcChanged = node.attrs.src !== correctMedia.src;
                const isTypeChanged = node.attrs.mediaType !== correctMedia.mediaType;

                if (isLabelChanged || isSrcChanged || isTypeChanged) {
                    shouldDispatch = true;

                    tr.setNodeMarkup(pos, undefined, {
                        ...node.attrs,
                        label: correctMedia.label,
                        src: correctMedia.src,
                        mediaType: correctMedia.mediaType,
                    });
                }
            });

            if (shouldDispatch) {
                editor.view.dispatch(
                    tr.setMeta('addToHistory', false)
                );

                const newText = editor.getText();
                lastLoadedPromptRef.current = newText;

                /**
                 * 这里不要 setPrompt(newText)。
                 * prompt 的语义重映射已经由 GenerationPanel 完成。
                 * 这里如果再次 setPrompt，容易在拖拽中产生竞态。
                 */
            }
        });
    }, [
        editor,
        currentMediaSignature
    ]);

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

    if (!editor) return null;

    return (
        <div className="px-1 mb-4 relative w-full border-none">
            {editor.isEmpty && (
                <div className="absolute top-0 left-1 pointer-events-none text-neutral-500 text-[15px] leading-relaxed">
                    {mode === 'image'
                        ? '描述你想生成的画面 (输入 @ 引用资产)...'
                        : '描述你想生成的视频内容 (输入 @ 引用资产)...'}
                </div>
            )}

            <EditorContent
                editor={editor}
                className="no-wheel [&>.ProseMirror]:min-h-[48px] [&>.ProseMirror]:max-h-[500px] [&>.ProseMirror]:overflow-y-auto [&>.ProseMirror]:resize-y [&>.ProseMirror]:outline-none [&>.ProseMirror]:p-0"
            />
        </div>
    );
});

MentionTextarea.displayName = 'MentionTextarea';

export default MentionTextarea;