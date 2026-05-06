export function cn(...values) {
  return values.filter(Boolean).join(' ');
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function truncateText(value, maxLength = 20) {
  const text = safeString(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

// 内部辅助函数：将各种格式的值安全转化为合法的 Date 对象
function parseSafeDate(value) {
  if (!value) return null;
  
  // 处理 10 位时间戳 (秒) -> 13 位 (毫秒)
  if (typeof value === 'number' && String(value).length === 10) {
    return new Date(value * 1000);
  }
  
  // 处理 Safari 下 '2024-03-26 12:00:00' 解析失败的问题
  if (typeof value === 'string' && value.includes('-') && value.includes(' ')) {
    value = value.replace(/-/g, '/');
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value) {
  const date = parseSafeDate(value);
  if (!date) return '--';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function formatDate(value) {
  const date = parseSafeDate(value);
  if (!date) return '--';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatTimeAgo(value) {
  const date = parseSafeDate(value);
  if (!date) return '--';

  const now = Date.now();
  // 避免服务器时间比本地时间快，导致 diff 为负数
  const diff = Math.max(0, now - date.getTime()); 

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < week) return `${Math.floor(diff / day)} 天前`;
  if (diff < month) return `${Math.floor(diff / week)} 周前`;
  if (diff < year) return `${Math.floor(diff / month)} 个月前`;

  return `${Math.floor(diff / year)} 年前`;
}

export function formatCount(value, unit = '项') {
  const count = Number(value) || 0;
  return `${count} ${unit}`;
}

export function formatFileSize(bytes) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  const fixed = current >= 10 ? current.toFixed(0) : current.toFixed(1);
  return `${fixed} ${units[unitIndex]}`;
}

export function sortByDate(list, key, order = 'desc') {
  const items = safeArray(list);

  return [...items].sort((a, b) => {
    const av = new Date(a?.[key] || 0).getTime();
    const bv = new Date(b?.[key] || 0).getTime();

    return order === 'desc' ? bv - av : av - bv;
  });
}

export function sortByName(list, key = 'name', order = 'asc') {
  const items = safeArray(list);

  return [...items].sort((a, b) => {
    const av = safeString(a?.[key]).toLowerCase();
    const bv = safeString(b?.[key]).toLowerCase();

    return order === 'desc'
      ? bv.localeCompare(av, 'zh-CN')
      : av.localeCompare(bv, 'zh-CN');
  });
}

export function filterByKeyword(list, keyword, key = 'name') {
  const items = safeArray(list);
  const q = safeString(keyword).trim().toLowerCase();

  if (!q) return items;

  return items.filter((item) =>
    safeString(item?.[key]).toLowerCase().includes(q)
  );
}