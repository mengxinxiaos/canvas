export function getPanelLayout({ anchor, viewportWidth, viewportHeight, preferredWidth = 520, margin = 16 }) {
    const width = Math.min(preferredWidth, Math.max(1, viewportWidth - margin * 2));
    const below = anchor.top + anchor.height + margin;
    // Keep the anchor relationship even when the node approaches the viewport
    // edge. The header/fullscreen action remains separate from scrolling content.
    const viewportCapacity = Math.max(1, viewportHeight - margin * 2);
    const maxHeight = Math.min(viewportCapacity, Math.max(220, viewportHeight - below - margin));
    return {
        width,
        maxHeight,
        left: Math.max(margin, Math.min(anchor.left + anchor.width / 2 - width / 2, viewportWidth - width - margin)),
        top: below,
    };
}
