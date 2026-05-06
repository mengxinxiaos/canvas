# app/utils/oss_utils.py
import asyncio
import functools
import os
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from urllib.parse import urlparse, unquote
from typing import Optional, List

import alibabacloud_oss_v2 as oss
import httpx
from app.core.config import settings

# 创建全局线程池，防止阻塞 FastAPI 主事件循环
OSS_EXECUTOR = ThreadPoolExecutor(max_workers=int(os.getenv("OSS_EXECUTOR_WORKERS", "8")))

@functools.lru_cache(maxsize=8)
def get_oss_client() -> oss.Client:
    """初始化并缓存 OSS Client"""
    creds = oss.credentials.StaticCredentialsProvider(
        access_key_id=settings.OSS_ACCESS_KEY_ID,
        access_key_secret=settings.OSS_ACCESS_KEY_SECRET,
    )
    cfg = oss.config.load_default()
    cfg.credentials_provider = creds
    cfg.region = settings.OSS_REGION
    cfg.endpoint = settings.OSS_ENDPOINT
    return oss.Client(cfg)

async def _head_url(url: str, timeout: float = 5.0) -> int:
    """使用上下文管理器安全地发起 HEAD 请求，自动管理连接池和事件循环"""
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=timeout,
        headers={"Accept-Encoding": "identity"}
    ) as client:
        resp = await client.head(url)
        return resp.status_code

async def upload_object_async(
    key: str,
    stream: bytes, 
    content_type: str = "application/octet-stream",
    put_timeout: int = 60,
    head_timeout: int = 5,
    verify: bool = True,
) -> str:
    """
    异步上传对象到 OSS
    返回文件的完整访问 URL
    """
    loop = asyncio.get_running_loop()
    client = get_oss_client()

    # 确保拿到的是 bytes
    body_data = stream.getvalue() if hasattr(stream, 'getvalue') else stream

    req_put = oss.PutObjectRequest(
        bucket=settings.OSS_BUCKET_NAME, 
        key=key, 
        body=body_data
    )
    req_put.headers = {
        "Content-Type": content_type,
        "Content-Length": str(len(body_data)),
    }

    start = loop.time()
    # 在线程池中执行同步的 put_object 避免阻塞
    result = await asyncio.wait_for(
        loop.run_in_executor(OSS_EXECUTOR, client.put_object, req_put),
        timeout=put_timeout,
    )

    if getattr(result, "status_code", None) != 200:
        raise RuntimeError(f"上传 OSS 失败: status={getattr(result, 'status_code', None)}")

    if verify:
        url = f"{settings.OSS_URL_PREFIX}/{key}"
        # 🌟 _head_url 现在是完全安全的
        code = await asyncio.wait_for(_head_url(url, timeout=head_timeout), timeout=head_timeout + 1)
        if code != 200:
            raise RuntimeError(f"上传 OSS 检查失败: HEAD {url} -> {code}")

    elapsed = (loop.time() - start) * 1000
    print(f"上传 {key} 成功，耗时 {elapsed:.0f} ms")

    # 返回拼接好的完整 URL
    return f"{settings.OSS_URL_PREFIX}/{key}"

async def delete_object_async(key: str):
    """实际执行 OSS 删除操作的函数"""
    loop = asyncio.get_running_loop()
    client = get_oss_client()
    req_del = oss.DeleteObjectRequest(bucket=settings.OSS_BUCKET_NAME, key=key)
    await loop.run_in_executor(OSS_EXECUTOR, client.delete_object, req_del)
    print(f"🧹 清理完成：[{key}] 已从 OSS 中彻底删除。")

async def delayed_delete_task(key: str, delay_sec: int):
    """后台倒计时任务"""
    print(f"⏳ 计划任务：[{key}] 将在 {delay_sec} 秒后被自动删除...")
    await asyncio.sleep(delay_sec)
    try:
        await delete_object_async(key)
    except Exception as e:
        print(f"❌ 删除失败：[{key}] 无法自动删除: {e}")

def extract_filenames_from_urls(urls: List[str]) -> List[str]:
    """
    从给定的 URL 列表中提取文件名，去掉查询参数并对 URL 编码解码。
    """
    filenames = []
    for url in urls:
        path = urlparse(url).path
        name = os.path.basename(path)
        name = unquote(name)
        filenames.append(name)
    return filenames