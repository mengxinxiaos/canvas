import { API_BASE_URL } from '../config/constants';

export const fetchApi = async (endpoint, options = {}) => {
    const token = localStorage.getItem('tapnow_token');
    const headers = { ...options.headers };
    
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
        const data = await response.json();
        
        if (response.status === 401) {
            localStorage.removeItem('tapnow_token');
            window.location.reload();
            throw new Error('认证过期，请重新登录');
        }
        
        if (data.code !== 0) {
            const error = new Error(data.message || 'API 请求失败');
            error.code = data.code;
            error.data = data.data;
            throw error;
        }
        return data.data;
    } catch (err) {
        console.error(`API Error [${endpoint}]:`, err);
        throw err;
    }
};