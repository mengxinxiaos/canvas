import React from 'react';
import { Plus, Folder, Image as ImageIcon } from 'lucide-react';
import { formatTimeAgo } from '../utils';
import RenameEditor from './RenameEditor';
import ProjectItemActions from './ProjectItemActions';

export default function ProjectGridView({
  projects,
  onOpenItem,
  onCreate,
  rename,
  actionMenu,
  onOpenMenu,
  onCloseMenu,
  getProjectActions,
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
      <button
        type="button"
        onClick={onCreate}
        className="bg-[#1a1a1a] border border-transparent hover:border-white/10 rounded-2xl flex flex-col items-center justify-center aspect-[4/3.2] group transition-all"
      >
        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black mb-3 group-hover:scale-110 transition-transform">
          <Plus size={22} strokeWidth={3} />
        </div>
        <span className="text-[13px] font-medium text-white/70">新建项目</span>
      </button>

      {projects.map((proj) => {
        const editing = rename.isRenaming(proj.id);

        return (
          <article
            key={proj.id}
            className="group flex flex-col bg-[#1a1a1a] rounded-2xl border border-transparent hover:border-white/10 overflow-hidden aspect-[4/3.2] transition-all"
          >
            <div className="relative flex-1 bg-[#222] overflow-hidden">
              <button
                type="button"
                disabled={editing || rename.submitting}
                onClick={() => onOpenItem(proj)}
                className="w-full h-full flex items-center justify-center disabled:cursor-default"
              >
                {proj.isFolder ? (
                  <div className="flex flex-col items-center gap-2 text-white/20">
                    <Folder size={40} />
                    <span className="text-[10px] uppercase tracking-tighter font-bold">
                      Folder
                    </span>
                  </div>
                ) : proj.thumbnail ? (
                  <img
                    src={proj.thumbnail}
                    alt={proj.name}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                ) : (
                  <ImageIcon size={32} className="text-white/5" />
                )}
              </button>

              {!editing ? (
                <div className="absolute top-2 right-2">
                  <ProjectItemActions
                    project={proj}
                    actionMenu={actionMenu}
                    onOpenMenu={onOpenMenu}
                    onCloseMenu={onCloseMenu}
                    getProjectActions={getProjectActions}
                  />
                </div>
              ) : null}
            </div>

            <div className="p-4 bg-[#1a1a1a]">
              {editing ? (
                <RenameEditor
                  rename={rename}
                  onSave={rename.commitRename}
                  onCancel={rename.cancelRename}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenItem(proj)}
                  className="block w-full text-left"
                >
                  <h3 className="text-[14px] font-medium text-white/90 truncate">
                    {proj.name}
                  </h3>
                  <div className="flex justify-between items-center mt-1.5">
                    <p className="text-[11px] text-white/30">
                      编辑于 {formatTimeAgo(proj.updatedAt)}
                    </p>
                    <p className="text-[10px] text-white/20 font-bold uppercase">
                      {proj.isFolder ? 'Folder' : 'Canvas'}
                    </p>
                    
                  </div>
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}