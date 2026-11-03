import React, { useMemo, useRef, useState } from 'react';
import { ImageIcon, LinkIcon, Music2, Video, X } from 'lucide-react';
import { getReferenceType, getReferenceSignature, labelReferenceMedia, reorderReferenceType } from '../../../../utils/referenceMedia';
import AssetPreview from './AssetPreview.jsx';

const EMPTY_MEDIA = [];
const GROUPS = [
    { type: 'image', title: '图片', Icon: ImageIcon },
    { type: 'video', title: '视频', Icon: Video },
    { type: 'audio', title: '音频', Icon: Music2 },
];

export default function PictureTags({
    pictures = EMPTY_MEDIA,
    mode,
    videoRefMode,
    maxAssets,
    onReorder,
    onDelete,
    onInsert,
    expanded = false,
}) {
    // A draft belongs to one exact source snapshot. Incoming asset changes invalidate it,
    // so a late drop cannot reintroduce a disconnected or externally reordered asset.
    const [drag, setDrag] = useState(null);
    const dragRef = useRef(null);
    const [hover, setHover] = useState(null);
    const sourceSignature = getReferenceSignature(pictures);
    const currentDrag = drag?.source === sourceSignature ? drag : null;
    const visiblePictures = currentDrag?.items || pictures;
    const labeled = useMemo(() => labelReferenceMedia(visiblePictures), [visiblePictures]);
    const hoveredAsset = hover?.source === sourceSignature && hover.expanded === expanded ? hover.media : null;
    const overLimit = maxAssets != null && labeled.length > maxAssets;

    const clearDrag = () => {
        dragRef.current = null;
        setDrag(null);
    };

    const previewReorder = (event, target) => {
        const active = dragRef.current;
        if (!active || active.source !== sourceSignature || getReferenceType(target) !== active.type) return;
        event.preventDefault();
        // Keep the canvas file-upload handler from overwriting the move effect.
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        const items = reorderReferenceType(active.items, active.id, target.id);
        if (items === active.items) return;
        const next = { ...active, items };
        dragRef.current = next;
        setDrag(next);
    };

    const commitDrop = (event, target) => {
        const active = dragRef.current;
        if (!active || active.source !== sourceSignature || getReferenceType(target) !== active.type) return;
        event.preventDefault();
        event.stopPropagation();
        // Drag-over already produced the visible order; moving again here would
        // invert adjacent drops and submit an order different from the preview.
        const items = active.items;
        clearDrag();
        if (items.some((media, index) => media.id !== pictures[index]?.id)) onReorder?.(items);
    };

    const keyboardReorder = (event, media, group) => {
        if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        const target = group[group.findIndex(item => item.id === media.id) + direction];
        if (target) onReorder?.(reorderReferenceType(pictures, media.id, target.id));
    };

    const showPreview = (media, x, y) => {
        if (dragRef.current?.source === sourceSignature) return;
        setHover({ source: sourceSignature, media, x, y, expanded });
    };

    if (labeled.length === 0) return null;

    return (
        <div className={expanded ? 'flex h-full min-h-0 flex-col' : 'shrink-0 mb-3 border-b border-white/5 pb-3 min-h-0'}>
            <div className="flex shrink-0 items-center justify-between gap-2 px-1 mb-2 text-xs">
                <span className="flex items-center gap-1.5 text-neutral-400"><LinkIcon size={13} />参考资产</span>
                <span className={overLimit ? 'text-amber-400 tabular-nums' : 'text-neutral-500 tabular-nums'}>
                    {labeled.length}{maxAssets != null ? ` / ${maxAssets}` : ''} 项{overLimit ? ' · 已超出模型上限' : ''}
                </span>
            </div>
            <div className={`${expanded ? 'flex-1 min-h-0' : 'max-h-[min(300px,40dvh)]'} overflow-y-auto overscroll-contain px-1 pt-1 pb-2 space-y-3 [scrollbar-width:thin]`}
                aria-label="按类型分组的参考资产" onScroll={() => setHover(null)}>
                {GROUPS.map(groupDefinition => {
                    const { type, title, Icon } = groupDefinition;
                    const group = labeled.filter(media => getReferenceType(media) === type);
                    return (
                        <section key={type} aria-label={`${title}引用`}>
                            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mb-2">
                                <Icon size={12} /><span>{title}</span><span className="text-neutral-600 tabular-nums">{group.length}</span>
                            </div>
                            {group.length === 0 ? <p className="text-[11px] text-neutral-600 py-1">未连接{title}</p> : (
                                <div className={`grid gap-2 ${expanded ? 'grid-cols-[repeat(auto-fill,minmax(72px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(48px,1fr))]'}`}>
                                    {group.map((media, index) => {
                                        const firstLast = mode === 'video' && videoRefMode === 'first_last' && type === 'image';
                                        const frameRole = firstLast ? (index === 0 ? '首' : index === group.length - 1 ? '尾' : '参') : null;
                                        return (
                                            <div key={media.id} data-reference-id={media.id} draggable
                                                className={`group relative min-w-0 aspect-square ${currentDrag?.id === media.id ? 'opacity-40' : ''}`}
                                                onDragStart={event => {
                                                    const next = { source: sourceSignature, items: pictures, id: media.id, type };
                                                    dragRef.current = next;
                                                    setDrag(next);
                                                    setHover(null);
                                                    event.dataTransfer.effectAllowed = 'move';
                                                    event.dataTransfer.setData('text/plain', String(media.id));
                                                }}
                                                onDragOver={event => previewReorder(event, media)}
                                                onDrop={event => commitDrop(event, media)}
                                                onDragEnd={clearDrag}>
                                                <button type="button" draggable={false}
                                                    className="relative w-full h-full cursor-grab active:cursor-grabbing overflow-hidden rounded-lg border border-white/10 bg-neutral-800 text-neutral-400 flex items-center justify-center outline-none hover:ring-2 hover:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                                                    aria-label={`引用${media.displayLabel}${frameRole ? `，${frameRole}帧` : ''}`}
                                                    title="拖拽排序，点击引用"
                                                    aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                                                    onKeyDown={event => keyboardReorder(event, media, group)}
                                                    onClick={() => onInsert?.(media)}
                                                    onMouseEnter={event => showPreview(media, event.clientX, event.clientY)}
                                                    onMouseMove={event => showPreview(media, event.clientX, event.clientY)}
                                                    onMouseLeave={() => setHover(null)}
                                                    onFocus={event => {
                                                        const rect = event.currentTarget.getBoundingClientRect();
                                                        showPreview(media, rect.left + rect.width / 2, rect.top);
                                                    }}
                                                    onBlur={() => setHover(null)}>
                                                    {type === 'image' ? (
                                                        <img src={media.src} alt="" loading="lazy" decoding="async" draggable={false}
                                                            className="w-full h-full object-cover pointer-events-none" />
                                                    ) : <Icon size={22} className="pointer-events-none" />}
                                                    <span className="absolute left-0 top-0 bg-black/75 text-white text-[9px] px-1 py-0.5 rounded-br-md pointer-events-none">{media.displayLabel}</span>
                                                    {frameRole && <span className="absolute right-0 bottom-0 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded-tl-md pointer-events-none">{frameRole}</span>}
                                                </button>
                                                <button type="button" draggable={false} aria-label={`移除${media.displayLabel}的连接`}
                                                    onClick={event => { event.stopPropagation(); setHover(null); onDelete?.(media.id); }}
                                                    className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-neutral-700 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-opacity">
                                                    <X size={10} strokeWidth={3} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
            {hoveredAsset && <AssetPreview media={hoveredAsset} x={hover.x} y={hover.y} hint="拖拽排序，点击引用" />}
        </div>
    );
}
