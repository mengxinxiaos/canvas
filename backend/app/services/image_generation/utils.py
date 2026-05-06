import os
import httpx
import base64
from app.core.config import settings

IMAGE_INPUT_FETCH_TIMEOUT = 20
# 针对 HTTPX 的细粒度超时：连接10秒，读取无限制（由上层任务统一兜底）
IMAGE_API_TIMEOUT = httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0)

async def get_file_bytes_async(url: str) -> bytes:
    """读取本地媒体文件并返回字节流，兼容前端传来的完整 http URL"""
    if not url:
        return None

    if "/media/" in url and not url.startswith("http"):
        rel_path = url.split("/media/", 1)[1]
        full_path = os.path.join(settings.MEDIA_ROOT, rel_path)
        if os.path.exists(full_path):
            with open(full_path, "rb") as f:
                return f.read()
                
    if url.startswith("http://") or url.startswith("https://"):
        try:
            async with httpx.AsyncClient(timeout=IMAGE_INPUT_FETCH_TIMEOUT) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.content
        except Exception as e:
            print(f"⚠️ 获取远程文件失败 [{url}]: {e}")
            return None
    return None

def bytes_to_base64_data_uri(file_bytes: bytes, ext: str = "png") -> str:
    """将字节流转换为 Base64 Data URI"""
    if not file_bytes:
        return None
    b64_str = base64.b64encode(file_bytes).decode("utf-8")
    return f"data:image/{ext};base64,{b64_str}"

def _get_resolution_gpt_image(size_str: str, ratio: str) -> str:
        """
        针对 GPT 图像模型 (如 gpt-image-2) 的分辨率映射。
        必须满足：长边 <= 3840，宽高均为 16 的倍数，总像素在 [655360, 8294400] 之间。
        """
        # 1K 级别 (基础分辨率，也是官方最稳定的区间)
        if size_str == "1K":
            return {
                "1:1": "1024x1024",
                "4:3": "1536x1024",   # GPT 常用宽屏 (3:2/4:3近似)
                "16:9": "1672x941",  
                "3:4": "1024x1536",   # GPT 常用竖屏
                "9:16": "941x1672",
                "21:9": "1680x720",
            }.get(ratio, "1024x1024")
            
        # 2K 级别 (高质量区间)
        elif size_str == "2K":
            return {
                "1:1": "2048x2048",
                "4:3": "2048x1536",
                "16:9": "2048x1152",  # 你的 ComfyUI 列表中支持的标准 2K 宽屏
                "3:4": "1536x2048",
                "9:16": "1152x2048",
                "21:9": "2688x1152",
            }.get(ratio, "2048x2048")
            
        # 4K 级别 (触碰平台极限区间)
        elif size_str == "4K":
            return {
                # 平台长边不得超过 3840，且比例不能超过 3:1。
                # 4K 1:1 按 3840x3840 会超像素上限 (8,294,400)，所以最高只能给到 2880x2880，为稳妥这里给 2048x2048
                "1:1": "2048x2048",   
                "16:9": "3840x2160",  # 你的列表中明确支持的 4K 宽屏
                "4:3": "2880x2160",   # 兼顾 4:3 比例和像素上限
                "9:16": "2160x3840",  # 你的列表中明确支持的 4K 竖屏
                "3:4": "2160x2880",
                "21:9": "3808x1632"
            }.get(ratio, "3840x2160") # 默认给 4K 宽屏
            
        # 兜底默认值，保证绝对能生成
        return "1024x1024"