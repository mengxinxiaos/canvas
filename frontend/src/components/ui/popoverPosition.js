const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** Keep floating controls inside the viewport, using the roomier side if needed. */
export function getPopoverPosition(anchor, size, viewport, margin = 12, gap = 12) {
    const availableWidth = Math.max(0, viewport.width - margin * 2);
    const availableHeight = Math.max(0, viewport.height - margin * 2);
    const width = Math.min(size.width, availableWidth);
    const above = clamp(anchor.top - gap - margin, 0, availableHeight);
    const below = clamp(viewport.height - anchor.bottom - gap - margin, 0, availableHeight);
    const placement = size.height <= above || above >= below ? 'top' : 'bottom';
    const maxHeight = placement === 'top' ? above : below;
    const height = Math.min(size.height, maxHeight);

    return {
        left: clamp(anchor.left, margin, Math.max(margin, viewport.width - margin - width)),
        top: clamp(
            placement === 'top' ? anchor.top - gap - height : anchor.bottom + gap,
            margin,
            Math.max(margin, viewport.height - margin - height),
        ),
        width,
        maxHeight,
        placement,
    };
}
