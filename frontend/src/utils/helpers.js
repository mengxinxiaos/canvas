import { API_BASE_URL } from '../config/constants';

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const getMediaUrl = (url) => {
    if (!url) return '';
    
    // ✅ 核心修复：检查 URL 中是否包含完整的 http:// 或 https://（可能在中间，因为被错误拼接过）
    const httpsIndex = url.indexOf('https://');
    const httpIndex = url.indexOf('http://');
    
    if (httpsIndex !== -1) {
        return url.substring(httpsIndex);
    }
    if (httpIndex !== -1) {
        return url.substring(httpIndex);
    }
    
    // 只有遇到旧的相对路径（比如 /media/xxx），才拼接本地后端的地址
    return `${API_BASE_URL}${url}`;
};

// 🌟 新增：智能计算节点尺寸的纯函数
export const getDimensionsByRatio = (ratioString, baseSize = 360) => {
    // 默认兜底 1:1
    if (!ratioString || typeof ratioString !== 'string') return { w: baseSize, h: baseSize };
    
    // 解析类似 "16:9", "4:3", "9:16" 的字符串
    const [ratioW, ratioH] = ratioString.split(':').map(Number);
    if (!ratioW || !ratioH) return { w: baseSize, h: baseSize };

    // 以最长边为 baseSize，等比缩放另一条边
    if (ratioW >= ratioH) {
        return { 
            w: baseSize, 
            h: Math.round(baseSize * (ratioH / ratioW)) 
        };
    } else {
        return { 
            w: Math.round(baseSize * (ratioW / ratioH)), 
            h: baseSize 
        };
    }
};

export const getImageDimensions = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width, h: img.height });
    img.onerror = () => resolve({ w: 300, h: 300 }); 
    img.src = src;
});
export const getVideoDimensions = (url) => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
            resolve({ w: video.videoWidth, h: video.videoHeight });
        };
        video.onerror = reject;
        video.src = url;
    });
};
export const calculateNodeSize = (w, h, maxEdge = 360) => {
    // 如果真实宽高都比基准值小，原样返回
    if (w <= maxEdge && h <= maxEdge) return { w, h };
    
    // 如果宽 >= 高（横图或方图），以宽度为基准计算比例
    if (w >= h) {
        const ratio = maxEdge / w;
        return { w: maxEdge, h: Math.round(h * ratio) };
    } 
    // 如果高 > 宽（竖图），以高度为基准计算比例
    else {
        const ratio = maxEdge / h;
        return { w: Math.round(w * ratio), h: maxEdge };
    }
};

