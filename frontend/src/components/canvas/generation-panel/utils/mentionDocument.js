import { labelReferenceMedia } from '../../../../utils/referenceMedia.js';

// Every position comes from the original document. Map it through earlier
// deletions before applying the next change to the same transaction.
export function syncReferenceMentions(transaction, mediaList) {
    const mediaById = new Map(labelReferenceMedia(mediaList).map(media => [media.id, media]));
    const document = transaction.doc;

    document.descendants((node, position) => {
        if (node.type.name !== 'mention') return;
        const media = mediaById.get(node.attrs.id);
        const from = transaction.mapping.map(position);

        if (!media) {
            transaction.delete(from, transaction.mapping.map(position + node.nodeSize));
            return;
        }

        if (node.attrs.label !== media.displayLabel ||
            node.attrs.src !== media.src || node.attrs.mediaType !== media.type) {
            transaction.setNodeMarkup(from, undefined, {
                ...node.attrs,
                label: media.displayLabel,
                src: media.src,
                mediaType: media.type,
            });
        }
    });

    return transaction;
}
