import os
import httpx
# 请确保安装了 SDK: pip install byteplus-python-sdk-v2
from byteplussdkarkruntime import AsyncArk
from app.services.video_generation.base import BaseVideoClient
from app.services.video_generation.utils import bytes_to_base64_data_uri, image_to_base64
from app.core.config import settings

class VolcengineClient(BaseVideoClient):
    def __init__(self, is_po_xian: bool, proxy_url: str = "http://127.0.0.1:7890"):
        api_version = "po_xian" if is_po_xian else "default"
        self.api_key, self.base_url = self.get_api_details(api_version)
        self.proxy_url = proxy_url
        # 1. 配置自定义的 HTTP 客户端 (注入代理)
        http_client = None
        if 0:
            if self.proxy_url:
                print(f"🚀 [VolcengineClient] 启用底层网络代理: {self.proxy_url}")
                http_client = httpx.AsyncClient(proxy=self.proxy_url, timeout=60.0)

        # 2. 初始化官方 AsyncArk 客户端，传入带代理的 HTTP 客户端
        self.ark_client = AsyncArk(
            base_url=self.base_url,
            api_key=self.api_key,
            http_client=http_client
        )

    def get_api_details(self, api_version):
        if api_version == "po_xian":
            api_key = settings.VOLCENGINE_POXIAN_API_KEY 
            base_url = settings.VOLCENGINE_POXIAN_API_BASE
        else:
            api_key = settings.VOLCENGINE_API_KEY
            base_url = settings.VOLCENGINE_API_BASE
        
        return api_key, base_url

    async def submit_task(self, client, prompt: str, model: str, **kwargs):
        # 注意：这里的传入参数 client (原 httpx.AsyncClient) 已不再需要，
        # 我们将使用 self.ark_client 发起请求，但保留入参以兼容您的 BaseVideoClient 接口设计。
        
 
        audio_urls = kwargs.get("audio_urls", [])
        video_urls = kwargs.get("video_urls", [])
        image_urls = kwargs.get("image_urls", [])

        if len(image_urls) > 9:
            return None, "火山引擎限制：最多支持 9 张参考图，请在画布中减少图片连线。"
        if len(video_urls) > 3:
            return None, "火山引擎限制：最多支持 3 段参考视频，请在画布中减少视频连线。"
        if len(audio_urls) > 3:
            return None, "火山引擎限制：最多支持 3 首参考音频，请在画布中减少音频连线。"

        has_visual_input = (len(image_urls) > 0) or (len(video_urls) > 0)
        if len(audio_urls) > 0 and not has_visual_input:
            return None, "sd2.0限制：不支持「纯音频」或「文本+音频」输入。请在画布中至少连接一张图片或一段视频作为视觉参考。"

        print(f"🚀 [VolcengineClient] 准备拼装 {model} 请求 Payload...")

        content = [{"type": "text", "text": prompt}]

        if len(audio_urls) > 0:
            for url in audio_urls:
                content.append({"type": "audio_url", "audio_url": {"url": url}, "role": "reference_audio"})

        if len(video_urls) > 0:
            for url in video_urls:
                content.append({"type": "video_url", "video_url": {"url": url}, "role": "reference_video"})

        if len(image_urls) > 0:
            for url in image_urls:
                content.append({"type": "image_url", "image_url": {"url": url}, "role": "reference_image"})
        else:
            first_frame_url = kwargs.get("first_frame_url")
            last_frame_url = kwargs.get("last_frame_url")

            if first_frame_url and last_frame_url:
                content.append({"type": "image_url", "image_url": {"url": first_frame_url}, "role": "first_frame"})
                content.append({"type": "image_url", "image_url": {"url": last_frame_url}, "role": "last_frame"})
            elif first_frame_url:
                content.append({"type": "image_url", "image_url": {"url": first_frame_url}})
        
        # 提取参数
        resolution = kwargs.get("resolution", "720p")
        ratio = kwargs.get("ratio", "adaptive")
        duration = int(kwargs.get("duration", 5))

        print(f"🚀 [VolcengineClient] 最终发给火山的 payload 核心参数:")
        print(f"   👉 Resolution: {resolution}")
        print(f"   👉 Duration: {duration}")
        print(f"   👉 Ratio: {ratio}")
        print(f"🚀 [VolcengineClient] content 节点数: {len(content)}")

        try:
            # 使用官方 SDK 创建任务
            create_result = await self.ark_client.content_generation.tasks.create(
                model=model,
                content=content,
                generate_audio=True,
                resolution=resolution, 
                ratio=ratio,
                duration=duration,
                watermark=False
            )
            
            # SDK 返回的是对象，我们直接提取属性
            if not hasattr(create_result, "id"):
                return None, f"Volc Error: {create_result}"
            return create_result.id, "Success"
            
        except Exception as e:
            return None, str(e)

    async def query_status(self, client, task_id: str):
        try:
            # 使用官方 SDK 获取任务状态
            get_result = await self.ark_client.content_generation.tasks.get(task_id=task_id)
            status = get_result.status
            
            if status == "succeeded":
                # 官方 SDK 解析后，content 层级变成对象属性，video_url 是内部属性。
                try:
                    if hasattr(get_result, "content") and hasattr(get_result.content, "video_url"):
                        video_url = get_result.content.video_url.url
                        return "Success", video_url
                except Exception:
                    pass
                return "Failed", "No video_url in content"
                
            elif status in ["failed", "canceled"]:
                # 提取错误信息
                error_msg = "Unknown Error"
                if hasattr(get_result, "error") and get_result.error:
                    error_msg = get_result.error.message if hasattr(get_result.error, "message") else str(get_result.error)
                return "Failed", error_msg
                
            elif status == "queued":
                return "Queued", "排队中"
            else:
                return "Processing", "生成中"
                
        except Exception as e:
            return "Error", str(e)

async def download_video_file(self, video_url: str, save_path: str):
        """
        使用代理将视频下载到本地
        :param video_url: 火山生成的 mp4 地址
        :param save_path: 本地保存路径，例如 "output/my_video.mp4"
        """
        print(f"🚀 [VolcengineClient] 开始下载视频，使用的代理: {self.proxy_url}")
        
        # 为了下载外网大文件，我们专门实例化一个带代理和重定向支持的 httpx 客户端
        async with httpx.AsyncClient(proxy=self.proxy_url, follow_redirects=True) as download_client:
            try:
                # 推荐使用 stream 模式下载大文件（视频）以节省内存
                async with download_client.stream("GET", video_url) as response:
                    response.raise_for_status()
                    with open(save_path, 'wb') as f:
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            f.write(chunk)
                print(f"✅ [VolcengineClient] 视频下载成功，已保存至: {save_path}")
                return True
            except Exception as e:
                print(f"❌ [VolcengineClient] 视频下载失败: {e}")
                return False