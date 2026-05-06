import React from 'react';
import { Folder, Image as ImageIcon } from 'lucide-react';
import { formatTimeAgo, formatDateTime } from '../utils';
import RenameEditor from './RenameEditor';
import ProjectItemActions from './ProjectItemActions';

export default function ProjectListView({
  projects,
  onOpenItem,
  rename,
  actionMenu,
  onOpenMenu,
  onCloseMenu,
  getProjectActions,
}) {
  return (
    <div className="bg-[#1a1a1a] rounded-xl border border-white/[0.04] overflow-hidden flex flex-col">
      <div className="grid grid-cols-[80px_3fr_1fr_1.5fr_2fr_2fr_72px] gap-4 px-6 py-4 border-b border-white/[0.04] text-[13px] text-white/40 font-medium bg-[#161616]">
        <div>预览</div>
        <div>名称</div>
        <div>类型</div>
        <div>内容</div>
        <div>创建时间</div>
        <div>最近更新</div>
        <div className="text-right px-2">操作</div>
      </div>

      <div className="flex flex-col">
        {projects.map((proj, index) => {
          const editing = rename.isRenaming(proj.id);

          return (
            <div
              key={proj.id}
              className={`group grid grid-cols-[80px_3fr_1fr_1.5fr_2fr_2fr_72px] gap-4 px-6 py-3.5 items-center hover:bg-white/[0.03] transition-colors ${
                index !== projects.length - 1 ? 'border-b border-white/[0.02]' : ''
              }`}
            >
              <div>
                <button
                  type="button"
                  onClick={() => onOpenItem(proj)}
                  disabled={editing || rename.submitting}
                  className="w-[54px] h-[34px] rounded bg-[#252525] overflow-hidden flex items-center justify-center disabled:cursor-default"
                >
                  {proj.isFolder ? (
                    <Folder size={16} className="text-white/40" />
                  ) : proj.thumbnail ? (
                    <img
                      src={proj.thumbnail}
                      alt={proj.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={14} className="text-white/10" />
                  )}
                </button>
              </div>

              <div className="min-w-0 pr-4">
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
                    className="max-w-full text-left"
                  >
                    <span className="block text-[14px] text-white/90 font-medium truncate">
                      {proj.name}
                    </span>
                  </button>
                )}
              </div>

              <div className="text-[13px] text-white/50">
                {proj.isFolder ? '文件夹' : '项目'}
              </div>

              <div className="text-[13px] text-white/50">
                {proj.isFolder
                  ? `${proj.itemCount || 0} 个项目`
                  : `${proj.nodes?.length || 0} 个节点`}
              </div>

              <div className="text-[13px] text-white/40 font-mono">
                {formatDateTime(proj.createdAt || proj.updatedAt)}
              </div>

              <div className="text-[13px] text-white/40">
                编辑于 {formatTimeAgo(proj.updatedAt)}
              </div>

              <div className="flex justify-end">
                {!editing ? (
                  <ProjectItemActions
                    project={proj}
                    actionMenu={actionMenu}
                    onOpenMenu={onOpenMenu}
                    onCloseMenu={onCloseMenu}
                    getProjectActions={getProjectActions}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}