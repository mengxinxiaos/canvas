import React from 'react';
import { Check } from 'lucide-react';

const Toast = ({ message }) => {
    if (!message) return null;
    return (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-neutral-800 text-white px-6 py-3 rounded-full shadow-2xl z-[200] flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 border border-white/10 font-medium text-sm tracking-wide">
            <Check size={16} className="text-green-400"/> {message}
        </div>
    );
};

export default Toast;