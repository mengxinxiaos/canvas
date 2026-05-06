import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { projectService } from '../../../services/api';
import { useProjectRename } from './useProjectRename';

const DEFAULT_FILTERS = {
  type: 'all',          // all | folder | project
  sortBy: 'updatedAt',  // updatedAt | createdAt | name
  sortOrder: 'desc',    // desc | asc
};

export function useProjectActions({ onOpenProject }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: '个人' }]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const [actionMenu, setActionMenu] = useState({
    openId: null,
    anchorRect: null,
  });

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);

  const requestIdRef = useRef(0);
  const projectsRef = useRef(projects);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id ?? null;

  const loadProjects = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const data = await projectService.fetchProjects(currentFolderId);
      if (requestId !== requestIdRef.current) return;
      setProjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('loadProjects failed:', error);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [currentFolderId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const rename = useProjectRename({
    onSubmit: async (id, name) => {
      const prevProjects = projectsRef.current;

      setProjects((items) =>
        items.map((item) => (item.id === id ? { ...item, name } : item))
      );

      try {
        await projectService.updateProject(id, { name });
        await loadProjects();
      } catch (error) {
        setProjects(prevProjects);
        throw error;
      }
    },
  });

  const closeActionMenu = useCallback(() => {
    setActionMenu({
      openId: null,
      anchorRect: null,
    });
  }, []);

  const openActionMenu = useCallback((project, triggerEl) => {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();

    setActionMenu({
      openId: project.id,
      anchorRect: rect,
    });
  }, []);

  const requestDelete = useCallback((project) => {
    setDeleteTarget(project);
    closeActionMenu();
  }, [closeActionMenu]);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const requestMove = useCallback((project) => {
    setMoveTarget(project);
    closeActionMenu();
  }, [closeActionMenu]);

  const cancelMove = useCallback(() => {
    setMoveTarget(null);
  }, []);

  const confirmMove = useCallback(async (destinationFolderId) => {
    if (!moveTarget) return;

    const id = moveTarget.id;
    const prevProjects = projectsRef.current;

    // 如果目标文件夹就是当前所在的文件夹，直接取消即可
    if (destinationFolderId === currentFolderId) {
      setMoveTarget(null);
      return;
    }

    // 1. 乐观更新：立即从当前视图中移除该项目
    setProjects((items) => items.filter((item) => item.id !== id));
    setMoveTarget(null);

    try {
      // 2. 发起 API 请求 (假设 projectService 提供了 moveProject 方法)
      await projectService.moveProject(id, destinationFolderId);
      // 后台移动成功后，可选择静默刷新以保证数据绝对一致
      // await loadProjects(); 
    } catch (error) {
      // 3. 失败回滚：如果接口报错，恢复原状并抛出错误（以便顶层捕获弹出 Toast）
      setProjects(prevProjects);
      console.error('移动失败，已回滚状态:', error);
      throw error;
    }
  }, [moveTarget, currentFolderId]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    const id = deleteTarget.id;
    const prevProjects = projectsRef.current;

    if (rename.editingId === id) {
      rename.cancelRename();
    }

    setProjects((items) => items.filter((item) => item.id !== id));
    setDeleteTarget(null);

    try {
      await projectService.deleteProject(id);
      await loadProjects();
    } catch (error) {
      setProjects(prevProjects);
      throw error;
    }
  }, [deleteTarget, loadProjects, rename]);

  const createProject = useCallback(
    async ({ isFolder }) => {
      const name = isFolder ? '未命名文件夹' : '未命名画布';
      await projectService.createProject(name, isFolder, currentFolderId);
      await loadProjects();
    },
    [currentFolderId, loadProjects]
  );

  const openItem = useCallback(
    (project) => {
      if (!project) return;
      if (rename.editingId === project.id || rename.submitting) return;

      if (project.isFolder) {
        setBreadcrumbs((prev) => [
          ...prev,
          { id: project.id, name: project.name },
        ]);
        return;
      }

      onOpenProject(project.id);
    },
    [onOpenProject, rename.editingId, rename.submitting]
  );

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const filteredProjects = useMemo(() => {
    let result = [...projects];
    const q = searchQuery.trim().toLowerCase();

    if (q) {
      result = result.filter((item) =>
        (item.name || '').toLowerCase().includes(q)
      );
    }

    if (filters.type === 'folder') {
      result = result.filter((item) => item.isFolder);
    } else if (filters.type === 'project') {
      result = result.filter((item) => !item.isFolder);
    }

    result.sort((a, b) => {
      if (filters.sortBy === 'name') {
        const av = (a.name || '').toLowerCase();
        const bv = (b.name || '').toLowerCase();
        return filters.sortOrder === 'desc'
          ? bv.localeCompare(av, 'zh-CN')
          : av.localeCompare(bv, 'zh-CN');
      }

      const av = new Date(a[filters.sortBy] || 0).getTime();
      const bv = new Date(b[filters.sortBy] || 0).getTime();
      return filters.sortOrder === 'desc' ? bv - av : av - bv;
    });

    return result;
  }, [projects, searchQuery, filters]);

  const getProjectActions = useCallback(
    (project) => [
      {
        key: 'open',
        label: '打开',
        danger: false,
        onClick: () => openItem(project),
      },
      {
        key: 'rename',
        label: '重命名',
        danger: false,
        onClick: () => {
          rename.startRename(project);
          closeActionMenu();
        },
      },
      {
        key: 'move',
        label: '移动到...',
        danger: false,
        onClick: () => requestMove(project),
      },
      {
        key: 'delete',
        label: '删除',
        danger: true,
        onClick: () => requestDelete(project),
      },
    ],
    [openItem, rename, closeActionMenu, requestDelete]
  );

  return {
    state: {
      rawProjects: projects,
      projects: filteredProjects,
      loading,
      searchQuery,
      breadcrumbs,
      currentFolderId,
      filters,
      actionMenu,
      deleteTarget,
      moveTarget,
    },
    actions: {
      reload: loadProjects,
      setSearchQuery,
      setBreadcrumbs,
      setFilter,
      resetFilters,
      openItem,
      openActionMenu,
      closeActionMenu,
      requestDelete,
      cancelDelete,
      confirmDelete,
      createFolder: () => createProject({ isFolder: true }),
      createCanvas: () => createProject({ isFolder: false }),
      getProjectActions,
      requestMove,
      cancelMove,
      confirmMove,
    },
    rename,
  };
}