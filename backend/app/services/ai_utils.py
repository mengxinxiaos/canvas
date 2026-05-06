import httpx
from app.models.domain import generate_id
from app.utils.oss_utils import upload_object_async

async def download_to_oss(remote_url: str, project_id: str, file_ext: str) -> str:
    """下载第三方生成的远端文件，上传到 OSS，返回 OSS 访问 URL"""
    media_id = generate_id("m")
    filename = f"{media_id}{file_ext}"
    key = f"projects/{project_id}/generated/{filename}"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(remote_url)
        response.raise_for_status()
        content = response.content
        
        # 上传到 OSS
        content_type = response.headers.get("Content-Type", "image/png")
        oss_url = await upload_object_async(
            key=key,
            stream=content,
            content_type=content_type
        )
            
    return oss_url

# 保持向后兼容
download_to_local = download_to_oss