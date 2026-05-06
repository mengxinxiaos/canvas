import { fetchApi } from '../utils/http';

export const authService = {
    login: (username, password) => fetchApi('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    getMe: () => fetchApi('/api/auth/me'),
    logout: () => { localStorage.removeItem('tapnow_token'); window.location.reload(); },
    //管理员开通子账号
    adminCreateUser: (username, password) => fetchApi('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
    fetchUsers: () => fetchApi('/api/auth/users'),
    updateUser: (userId, data) => fetchApi(`/api/auth/users/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (userId) => fetchApi(`/api/auth/users/${userId}`, { method: 'DELETE' })
};

export const projectService = {
    // 1. 获取项目列表 (已合并并保留支持父级 ID 的版本)
    fetchProjects: (parentId = null) => fetchApi(parentId ? `/api/projects?parent_id=${parentId}` : '/api/projects'),
    
    // 2. 获取单个项目详情
    fetchProject: (id) => fetchApi(`/api/projects/${id}`),
    
    // 3. 创建项目/文件夹 (已合并并保留支持目录层级的版本)
    createProject: (name, isFolder = false, parentId = null) => fetchApi('/api/projects', { method: 'POST', body: JSON.stringify({ name, is_folder: isFolder, parent_id: parentId }) }),
    
    // 4. 更新项目 (合并了 saveProject 和 updateProject，因为它们路由和方法完全一样)
    updateProject: (id, payload) => fetchApi(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    
    // 5. 删除项目
    deleteProject: (id) => fetchApi(`/api/projects/${id}`, { method: 'DELETE' }),

    // 移动项目/文件夹到新目录
    moveProject: (id, targetParentId) => fetchApi(`/api/projects/${id}/move`, { 
        method: 'POST', 
        body: JSON.stringify({ parent_id: targetParentId }) 
    }),

    saveProject: async (id, payload) => {
        return fetchApi(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    }
};

export const mediaService = {
    uploadFile: async (file, projectId, category = 'original') => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);
        formData.append('category', category);
        const headers = {}; // fetchApi 内部通常会自动处理 FormData 的 Content-Type，不要手动设为 application/json
        return fetchApi('/api/media/upload', { method: 'POST', body: formData, headers });
    }
};

export const taskService = {
    createImageTask: (payload) => fetchApi('/api/tasks/image-generation', { method: 'POST', body: JSON.stringify(payload) }),
    createVideoTask: (payload) => fetchApi('/api/tasks/video-generation', { method: 'POST', body: JSON.stringify(payload) }),
    queryTaskStatus: (taskId) => fetchApi(`/api/tasks/${taskId}`)
};

export const shareService = {
    createShare: (projectId, permission) => fetchApi(`/api/projects/${projectId}/share`, { method: 'POST', body: JSON.stringify({ permission }) })
};