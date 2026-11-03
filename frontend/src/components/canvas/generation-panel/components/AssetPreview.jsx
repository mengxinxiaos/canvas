import { createPortal } from 'react-dom';
import { Music2 } from 'lucide-react';
import { getReferenceType } from '../../../../utils/referenceMedia';
import { useOverlayContainer } from '../../../ui/OverlayContainerContext.js';

export default function AssetPreview({ media, x, y, hint }) {
    const getOverlayContainer = useOverlayContainer();
    const width = Math.max(0, Math.min(216, window.innerWidth - 16));
    const height = Math.max(0, Math.min(236, window.innerHeight - 16));
    const left = Math.max(8, Math.min(x - width / 2, window.innerWidth - width - 8));
    const preferredTop = y - height - 12 >= 8 ? y - height - 12 : y + 16;
    const top = Math.max(8, Math.min(preferredTop, window.innerHeight - height - 8));
    const type = getReferenceType(media);
    return createPortal(
        <div data-asset-preview className="fixed z-[9999] pointer-events-none rounded-xl border border-white/10 bg-[#1e1e1e]/95 p-2 shadow-2xl overflow-hidden"
            style={{ left, top, width, maxHeight: height }}>
            {type === 'video' ? (
                <video key={media.id} src={media.src} autoPlay loop muted playsInline preload="metadata"
                    className="w-full h-[176px] max-h-[24dvh] object-contain rounded-lg bg-black" />
            ) : type === 'image' ? (
                <img src={media.src} alt={media.displayLabel} className="w-full h-[176px] max-h-[24dvh] object-contain rounded-lg bg-black" />
            ) : <div className="h-20 flex items-center justify-center bg-neutral-900 rounded-lg text-neutral-400"><Music2 size={32} /></div>}
            <div className="mt-2 text-[11px] text-blue-400 truncate">{media.displayLabel}{hint && <span className="text-neutral-400 ml-1">· {hint}</span>}</div>
        </div>,
        getOverlayContainer(),
    );
}
