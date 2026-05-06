import React from 'react';

export default function RenameEditor({
  rename,
  onSave,
  onCancel,
  className = '',
}) {
  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={rename.draft}
        autoFocus
        disabled={rename.submitting}
        onChange={(e) => rename.changeDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') onCancel();
        }}
        className="w-full bg-[#2a2a2a] border border-blue-500/60 rounded px-2 py-1 text-sm text-white outline-none"
      />

      {rename.error ? (
        <p className="mt-2 text-[12px] text-red-400">{rename.error}</p>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={rename.submitting}
          className="text-[12px] text-white/50 hover:text-white"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={rename.submitting}
          className="px-2 py-1 rounded-md bg-white text-black text-[12px]"
        >
          {rename.submitting ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}