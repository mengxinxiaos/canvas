import httpx
import os
import base64
import io
from PIL import Image
from app.core.config import settings

async def get_file_bytes_async(url: str) -> bytes:
    """读取本地媒体文件并返回字节流，兼容前端传来的完整 http URL"""
    if not url:
        return None
    # 1. 兼容以前在本地硬盘的遗留数据
    if "/media/" in url and not url.startswith("http"):
        rel_path = url.split("/media/", 1)[1]
        full_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        if os.path.exists(full_path):
            with open(full_path, "rb") as f:
                return f.read()
                
    # 2. 如果是 OSS 链接或前端模板图的绝对链接，通过网络拉取到内存
    if url.startswith("http://") or url.startswith("https://"):
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.content
        except Exception as e:
            print(f"⚠️ 获取远程文件失败 [{url}]: {e}")
            return None

    return None

def image_to_base64(file_bytes, format='JPEG'):
    """通用图片转Base64工具"""
    if not file_bytes:
        return None
    try:
        image = Image.open(io.BytesIO(file_bytes))
        if image.mode in ('RGBA', 'LA', 'P'):
            image = image.convert('RGB')
        
        buffer = io.BytesIO()
        image.save(buffer, format=format, quality=95)
        img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return f"data:image/{format.lower()};base64,{img_str}"
    except Exception as e:
        print(f"图片处理失败: {e}")
        return None

def bytes_to_base64_data_uri(file_bytes: bytes, ext: str = "png") -> str:
    """将字节流转换为 Base64 Data URI"""
    if not file_bytes:
        return None
    b64_str = base64.b64encode(file_bytes).decode("utf-8")
    return f"data:image/{ext};base64,{b64_str}"

