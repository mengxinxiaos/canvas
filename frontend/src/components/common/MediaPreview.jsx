import React from 'react';
import { X } from 'lucide-react';

const MediaPreview = ({ media, onClose }) => {
    if (!media) return null;
    return (
        <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center p-8 backdrop-blur-md animate-in fade-in duration-200" onPointerDown={onClose}>
            <button className="absolute top-6 right-6 text-white/50 hover:text-white bg-white/10 p-2 rounded-full transition-colors"><X size={24}/></button>
            {media.type === 'video' ? (
                <video src={media.src} controls autoPlay className="max-w-full max-h-full rounded-lg shadow-2xl outline-none ring-1 ring-white/10" onPointerDown={e=>e.stopPropagation()}/>
            ) : (
                <img src={media.src} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl ring-1 ring-white/10" onPointerDown={e=>e.stopPropagation()}/>
            )}
        </div>
    );
};

export default MediaPreview;