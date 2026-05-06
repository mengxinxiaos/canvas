import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import DashboardHeader from './components/DashboardHeader';
import ProjectListView from './components/ProjectListView';
import ProjectGridView from './components/ProjectGridView';
import Sidebar from './components/Sidebar';
import MoveProjectDialog from './components/MoveProjectDialog';
import { useProjectActions } from './hooks/useProjectActions';

function DeleteConfirmDialog({ target, onCancel, onConfirm }) {
  return (
    <AnimatePresence>
      {target ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-[#1c1c1c] border border-white/10 rounded-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium text-white mb-2">确认删除</h3>
            <p className="text-sm text-white/50 mb-6">
              永久删除此内容？如果这是文件夹，内部的项目也会一并消失。
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm text-white/60 hover:text-white"
              >
                取消
              </button>
              <button
                onClick={onConfirm}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg"
              >
                确认
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export default function Dashboard({ user, onOpenProject, onLogout }) {
  const [viewMode, setViewMode] = useState('grid');
  const { state, actions, rename } = useProjectActions({ onOpenProject });

  const sharedProps = {
    projects: state.projects,
    onOpenItem: actions.openItem,
    rename,
    actionMenu: state.actionMenu,
    onOpenMenu: actions.openActionMenu,
    onCloseMenu: actions.closeActionMenu,
    getProjectActions: actions.getProjectActions,
  };

  return (
    // ✅ 顶级容器：变成横向排布的 flex
    <div className="min-h-screen bg-[#0e0e0e] text-white relative flex">
      
      {/* 1. 左侧可悬停展开的侧边栏 */}
      <Sidebar currentUser={user} onLogout={onLogout} />

      {/* 2. 右侧的主内容区，加上 pl-[72px] 让出侧边栏的位置 */}
      <div className="flex-1 pl-[72px] flex flex-col min-w-0">
        <div className="max-w-[1600px] w-full mx-auto p-10 h-screen flex flex-col">
          <DashboardHeader
            breadcrumbs={state.breadcrumbs}
            onNavigate={actions.setBreadcrumbs}
            searchQuery={state.searchQuery}
            onSearch={actions.setSearchQuery}
            viewMode={viewMode}
            onViewChange={setViewMode}
            onCreateFolder={actions.createFolder}
            onCreateProject={actions.createCanvas}
            filters={state.filters}
            setFilter={actions.setFilter}
            resetFilters={actions.resetFilters}
          />

          <div className="flex-1 overflow-y-auto mt-2">
            {viewMode === 'list' ? (
              <ProjectListView {...sharedProps} />
            ) : (
              <ProjectGridView {...sharedProps} onCreate={actions.createCanvas} />
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmDialog
        target={state.deleteTarget}
        onCancel={actions.cancelDelete}
        onConfirm={actions.confirmDelete}
      />
      {/* 移动操作的沙盒弹窗 */}
      <MoveProjectDialog
        target={state.moveTarget}
        currentFolderId={state.currentFolderId}
        onCancel={actions.cancelMove}
        onConfirm={actions.confirmMove}
      />
    </div>
    
  );
}