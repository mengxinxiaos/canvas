const REFERENCE_TYPES = {
    picture: 'image', image: 'image',
    video: 'video', video_media: 'video', video_node: 'video',
    audio: 'audio',
};
const PREFIXES = { image: '图', video: '视', audio: '音' };

export function getReferenceType(media) {
    return REFERENCE_TYPES[media?.type] ?? null;
}

export function labelReferenceMedia(mediaList) {
    const counts = { image: 0, video: 0, audio: 0 };
    return mediaList.filter(media => getReferenceType(media)).map(media => {
        const type = getReferenceType(media);
        return { ...media, tagPrefix: PREFIXES[type], displayLabel: `${PREFIXES[type]}${++counts[type]}` };
    });
}

// Preserve saved order; deduplicate edges and append newly connected assets.
export function reconcileReferenceOrder(mediaList, orderIds = []) {
    const byId = new Map(mediaList.filter(media => getReferenceType(media)).map(media => [media.id, media]));
    const ids = [...new Set([...orderIds, ...byId.keys()])];
    return ids.filter(id => byId.has(id)).map(id => byId.get(id));
}

export function serializeReferenceMedia(mediaList) {
    return mediaList.filter(media => getReferenceType(media) && media.src).map(media => ({
        id: media.id, url: media.src, type: getReferenceType(media),
    }));
}

// Saved inputs retain type/identity even if an edge was removed while the panel
// was closed. Use that snapshot to resolve old @ labels before renumbering.
export function restoreReferenceMedia(generation, currentMedia) {
    const saved = generation?.inputs;
    if (!Array.isArray(saved) || !saved.some(input => input.id != null)) return currentMedia;
    const byId = new Map(currentMedia.map(media => [media.id, media]));
    for (const input of saved) {
        if (input.id != null && getReferenceType(input)) {
            byId.set(input.id, { id: input.id, type: input.type, src: input.url });
        }
    }
    const order = generation.referenceNodeIds ?? saved.map(input => input.id);
    return order.map(id => byId.get(id)).filter(Boolean);
}

// Map the whole token in one pass so @图1 never corrupts @图10 or swaps twice.
export function remapReferencePrompt(prompt, previous, next) {
    const previousByLabel = new Map(labelReferenceMedia(previous).map(media => [media.displayLabel, media.id]));
    const nextById = new Map(labelReferenceMedia(next).map(media => [media.id, media.displayLabel]));
    return prompt.replace(/@([图视音]\d+)/g, (token, label) => {
        const id = previousByLabel.get(label);
        if (id === undefined) return token;
        const nextLabel = nextById.get(id);
        return nextLabel ? `@${nextLabel}` : '';
    });
}

// Reordering within a type must not change the order of other media types.
export function reorderReferenceType(mediaList, draggedId, targetId) {
    const dragged = mediaList.find(media => media.id === draggedId);
    const type = getReferenceType(dragged);
    const group = mediaList.filter(media => getReferenceType(media) === type);
    const from = group.findIndex(media => media.id === draggedId);
    const to = group.findIndex(media => media.id === targetId);
    if (!type || from < 0 || to < 0 || from === to) return mediaList;
    group.splice(to, 0, group.splice(from, 1)[0]);
    let index = 0;
    return mediaList.map(media => getReferenceType(media) === type ? group[index++] : media);
}

export function getReferenceSignature(mediaList) {
    return JSON.stringify(mediaList.map(({ id, type, src }) => [id, type, src]));
}

export function getReferenceValidationError(mediaList, mode, config = {}) {
    if (mediaList.some(media => !media.src)) return '有引用资产尚未生成或上传完成，请完成后再生成。';
    const types = mediaList.map(getReferenceType);
    if (mode === 'image' && types.some(type => type !== 'image')) {
        return '当前图片模型仅支持图片参考，请断开视频和音频引用。';
    }
    if (config.maxReferenceAssets && mediaList.length > config.maxReferenceAssets) {
        return `当前模型最多支持 ${config.maxReferenceAssets} 个引用资产，已连接 ${mediaList.length} 个。`;
    }
    if (mode === 'video' && types.includes('audio') && !types.some(type => type === 'image' || type === 'video')) {
        return '音频参考需要至少一张图片或一个视频作为画面参考。';
    }
    return null;
}
