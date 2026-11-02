import { API_BASE_URL } from '../config/constants';
// fetchApi()     用于普通 JSON 接口
// fetchRawApi()  用于流式、下载、blob、非 JSON 接口

export const buildApiUrl = (endpoint) => {
    if (/^https?:\/\//i.test(endpoint)) {
        return endpoint;
    }

    return `${API_BASE_URL}${endpoint}`;
};

export const buildApiHeaders = (options = {}) => {
    const token = localStorage.getItem('tapnow_token');
    const headers = { ...(options.headers || {}) };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    return headers;
};

export const fetchRawApi = async (endpoint, options = {}) => {
    const headers = buildApiHeaders(options);

    const response = await fetch(buildApiUrl(endpoint), {
        ...options,
        headers,
    });

    if (response.status === 401) {
        localStorage.removeItem('tapnow_token');
        window.location.reload();
        throw new Error('认证过期，请重新登录');
    }

    return response;
};

export const fetchApi = async (endpoint, options = {}) => {
    try {
        const response = await fetchRawApi(endpoint, options);

        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : null;

        if (!response.ok) {
            const error = new Error(
                data?.message ||
                data?.detail ||
                `HTTP ${response.status} ${response.statusText}`
            );

            error.status = response.status;
            error.code = data?.code;
            error.data = data?.data ?? data;
            error.response = { status: response.status, data };

            throw error;
        }

        if (data?.code !== 0) {
            const error = new Error(data?.message || data?.detail || 'API 请求失败');
            error.code = data?.code;
            error.data = data?.data;
            error.response = { status: response.status, data };
            throw error;
        }

        return data.data;
    } catch (err) {
        console.error(`API Error [${endpoint}]:`, err);
        throw err;
    }
};