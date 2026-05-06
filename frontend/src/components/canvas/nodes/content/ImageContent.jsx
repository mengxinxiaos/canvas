import React, { useState, useEffect } from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import DoodleCanvas from '../../DoodleCanvas';
import ImageCropper from '../../ImageCropper';

const getThumbnailUrl = (originalUrl) => {
  if (!originalUrl) return '';
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }

  // 🌟 修改点：防御性检查。如果已经包含 OSS 处理参数，直接返回原图，避免参数冲突
  if (originalUrl.includes('x-oss-process')) {
    return originalUrl;
  }

  const separator = originalUrl.includes('?') ? '&' : '?';
  return `${originalUrl}${separator}x-oss-process=image/resize,w_400`;
};

export default function ImageContent({
  node,
  isSelected,
  isDrawing,
  isCropping,
  zoom,
  projectId,
  actions
}) {
  const [highResLoaded, setHighResLoaded] = useState(false);
  const [shouldLoadHighRes, setShouldLoadHighRes] = useState(false);
  const [highResError, setHighResError] = useState(false);

  const lowResSrc = getThumbnailUrl(node.src);
  const highResSrc = node.src;
  const needHighRes = zoom > 0.8 || isSelected;
  const isSameSource = lowResSrc === highResSrc;

  useEffect(() => {
    setHighResLoaded(false);
    setHighResError(false);
    setShouldLoadHighRes(false);
  }, [node.src]);

  useEffect(() => {
    // 一旦触发高清加载，不主动降级，避免频繁切换
    if (needHighRes) {
      setShouldLoadHighRes(true);
    }
  }, [needHighRes]);

  return (
    <div
      className={`w-full h-full relative rounded-2xl flex flex-col ${
        isSelected
          ? 'ring-2 ring-blue-500 shadow-[0_8px_30px_rgba(0,0,0,0.5)]'
          : 'shadow-lg ring-1 ring-white/10'
      } ${(isDrawing || isCropping) ? 'overflow-visible' : 'overflow-hidden'}`}
      style={{ backgroundColor: 'transparent' }}
    >
      <div
        className={`w-full h-full flex items-center justify-center relative group ${
          (isDrawing || isCropping) ? 'overflow-visible' : 'overflow-hidden'
        }`}
      >
        {isDrawing ? (
          <DoodleCanvas
            src={node.src}
            zoom={zoom}
            projectId={projectId}
            onSave={(url) => actions.onDoodleSave(node.id, url)}
            onCancel={() => actions.onDrawStart(null, null)}
          />
        ) : isCropping ? (
          <ImageCropper
            node={node}
            zoom={zoom}
            projectId={projectId}
            onSave={(newUrl, w, h, x, y) =>
              actions.onCropSave(node.id, newUrl, w, h, x, y)
            }
            onSplitSave={(urls, cols, rows, pW, pH) =>
              actions.onSplitSave(node.id, urls, cols, rows, pW, pH)
            }
            onCancel={() => actions.onCropStart(null, null)}
          />
        ) : node._isLoading ? (
          <div className="flex flex-col items-center gap-2 text-neutral-500">
            <Loader2 className="animate-spin" size={24} />
            <span className="text-xs">处理中...</span>
          </div>
        ) : node.src ? (
          isSameSource ? (
            <img
              src={highResSrc}
              alt=""
              draggable={false}
              className="w-full h-full object-contain"
              crossOrigin="anonymous"
            />
          ) : (
            <>
              <img
                src={lowResSrc}
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain filter blur-[2px] transition-opacity duration-300"
                style={{ opacity: highResLoaded ? 0 : 1 }}
                crossOrigin="anonymous"
              />

              {shouldLoadHighRes && !highResError && (
                <img
                  src={highResSrc}
                  alt=""
                  draggable={false}
                  className={`relative z-10 w-full h-full object-contain transition-opacity duration-500 ${
                    highResLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                  crossOrigin="anonymous"
                  decoding="async"
                  onLoad={() => setHighResLoaded(true)}
                  onError={() => setHighResError(true)}
                />
              )}
            </>
          )
        ) : (
          <ImageIcon className="text-neutral-700" size={32} />
        )}
      </div>
    </div>
  );
}