import React, { useMemo, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function ProjectItemActions({
  project,
  actionMenu,
  onOpenMenu,
  onCloseMenu,
  getProjectActions,
}) {
  const btnRef = useRef(null);

  const isOpen = actionMenu.openId === project.id && !!actionMenu.anchorRect;
  const actions = useMemo(() => getProjectActions(project), [getProjectActions, project]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();

          if (isOpen) {
            onCloseMenu();
            return;
          }

          onOpenMenu(project, btnRef.current);
        }}
        className={[
          'p-2 rounded-lg transition-all duration-150',
          'bg-black/35 backdrop-blur-sm text-white/55 hover:bg-black/55 hover:text-white',
          isOpen
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        ].join(' ')}
        aria-label="更多操作"
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen
        ? createPortal(
            <div className="fixed inset-0 z-[120]" onClick={onCloseMenu}>
              <div
                className="absolute min-w-[180px] rounded-2xl border border-white/10 bg-[#232323] shadow-2xl overflow-hidden"
                style={{
                  top: actionMenu.anchorRect.bottom + 8,
                  left: Math.max(12, actionMenu.anchorRect.right - 180),
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                      action.danger
                        ? 'text-red-400 hover:bg-red-500/10'
                        : 'text-white/85 hover:bg-white/5'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}