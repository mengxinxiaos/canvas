import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Folder, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import { projectService } from '../../../services/api'; // 根据实际路径调整

export default function MoveProjectDialog({ target, currentFolderId, onCancel, onConfirm }) {
  // 弹窗内部独立的浏览记录 (类似面包屑)
  const [navHistory, setNavHistory] = useState([{ id: null, name: '个人根目录' }]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentNav = navHistory[navHistory.length - 1];

  // 独立获取弹窗内的文件夹列表
  const fetchFolders = useCallback(async (folderId) => {
    setLoading(true);
    try {
      // 获取指定层级的项目，然后过滤出文件夹
      const data = await projectService.fetchProjects(folderId);
      const onlyFolders = data.filter((item) => item.isFolder);
      setFolders(onlyFolders);
    } catch (error) {
      console.error('获取文件夹失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次进入新目录时重新获取数据
  useEffect(() => {
    if (target) {
      fetchFolders(currentNav.id);
    }
  }, [target, currentNav.id, fetchFolders]);

  // 重置状态 (当弹窗关闭时)
  useEffect(() => {
    if (!target) {
      setNavHistory([{ id: null, name: '个人根目录' }]);
      setSubmitting(false);
    }
  }, [target]);

  // 弹窗内的下钻交互
  const handleNavigateIn = (folder) => {
    setNavHistory((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  // 弹窗内的返回上一级
  const handleNavigateOut = () => {
    setNavHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(currentNav.id);
    } finally {
      setSubmitting(false);
    }
  };

  // 逻辑判断：是否允许移动到当前目录？
  // 1. 不能移动到项目原来所在的目录
  // 2. 如果当前正在移动的是个文件夹，绝对不能移动到它自己内部（此时弹窗中需过滤掉目标自身，见下方渲染逻辑）
  const isCurrentLocation = currentNav.id === currentFolderId;
  const isTargetItself = currentNav.id === target?.id;
  const canMoveHere = !isCurrentLocation && !isTargetItself;

  return (
    <AnimatePresence>
      {target ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="bg-[#1c1c1c] border border-white/10 rounded-2xl w-full max-w-[480px] shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部：导航控制 */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3 bg-[#222]">
              {navHistory.length > 1 ? (
                <button
                  onClick={handleNavigateOut}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/70"
                >
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <div className="w-[30px]" /> // 占位保持标题居中视觉
              )}
              <h3 className="flex-1 text-[15px] font-medium text-white truncate text-center">
                移动到 "{currentNav.name}"
              </h3>
              <div className="w-[30px]" />
            </div>

            {/* 列表区域 */}
            <div className="h-[320px] overflow-y-auto p-2 bg-[#1c1c1c]">
              {loading ? (
                <div className="w-full h-full flex items-center justify-center text-white/30">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : folders.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-[13px] text-white/30">
                  当前目录下没有文件夹
                </div>
              ) : (
                <ul className="space-y-1">
                  {folders.map((folder) => {
                    // 工业级防御：如果正在移动一个文件夹，在列表中不显示该文件夹自身，防止产生死循环递归
                    if (folder.id === target.id) return null;

                    return (
                      <li key={folder.id}>
                        <button
                          onClick={() => handleNavigateIn(folder)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.06] transition-colors group"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <Folder size={18} className="text-white/40 group-hover:text-blue-400 transition-colors" />
                            <span className="text-[14px] text-white/80 truncate">
                              {folder.name}
                            </span>
                          </div>
                          <ChevronRight size={16} className="text-white/20 group-hover:text-white/60" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 底部操作区 */}
            <div className="p-4 border-t border-white/10 bg-[#151515] flex justify-between items-center">
              <span className="text-[12px] text-white/40 truncate max-w-[50%]">
                正在移动: {target.name}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  disabled={submitting}
                  className="px-4 py-2 text-[13px] font-medium text-white/60 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canMoveHere || submitting}
                  className="px-5 py-2 text-[13px] font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/30 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {isCurrentLocation ? '已在当前目录' : '移动到此处'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}