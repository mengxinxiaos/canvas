// 🌍 核心容器：只负责调度数据的流向

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePanelPosition } from './hooks/usePanelPosition';
import { useGenerationParams } from './hooks/useGenerationParams';

import { buildPresetPrompt } from '../../../utils/promptbuilder';
import { getDimensionsByRatio } from '../../../utils/helpers'; 

import MentionTextarea from './components/MentionTextarea';
import ControlToolbar from './components/ControlToolbar';
import PictureTags from './components/PictureTags';

import { VIDEO_REFERENCE_MODES } from '../../../config/constants';

export default function GenerationPanel({ mode, anchorNode, incomingNodes, viewport, onGenerate, updateNodeData, onRemoveConnection }) {
   
    // 🚀 工业级：定义合法的媒体类型常量，防止硬编码漏删
    const VIDEO_TYPES = ['video', 'video_media', 'video_node', 'audio'];
    const IMAGE_TYPES = ['picture', 'image'];

    // 纯计算逻辑：根据节点获取面板的绝对定位样式 (top, left, opacity)
    const panelStyle = usePanelPosition(anchorNode, viewport, incomingNodes.length);
    
    // ✅ 新增：维护本地的排序和删除状态
    const [mediaOrderIds, setMediaOrderIds] = useState([]);
    const [deletedMediaIds, setDeletedMediaIds] = useState(new Set());

    // ✅ 新增：智能合并外部连线与本地状态
    useEffect(() => {
        const currentValidNodes = incomingNodes.filter(n => [...VIDEO_TYPES, ...IMAGE_TYPES].includes(n.type));
        const currentIds = currentValidNodes.map(n => n.id);
        
        setMediaOrderIds(prev => {
            // 保留当前依然连线且排好序的节点
            const existingOrdered = prev.filter(id => currentIds.includes(id));
            // 找出新连进来，且没有被手动删除的节点
            const newIds = currentIds.filter(id => !existingOrdered.includes(id) && !deletedMediaIds.has(id));
            
            if (existingOrdered.length === prev.length && newIds.length === 0) return prev;
            return [...existingOrdered, ...newIds];
        });
    }, [incomingNodes, deletedMediaIds]);

    // ✅ 修改：最终用于传递的媒体列表，基于本地排序后的 IDs
    const inputMedia = useMemo(() => {
        return mediaOrderIds
            .map(id => incomingNodes.find(n => n.id === id))
            .filter(Boolean);
    }, [mediaOrderIds, incomingNodes]);

    // ✅ 修改：根据重组后的 inputMedia 计算
    const hasMediaInput = useMemo(() => inputMedia.some(n => VIDEO_TYPES.includes(n.type)), [inputMedia]);
    const inputPicturesCount = useMemo(() => inputMedia.filter(n => IMAGE_TYPES.includes(n.type)).length, [inputMedia]);

    // ✅ 新增：排序与删除回调
    const handleReorder = (newList) => setMediaOrderIds(newList.map(m => m.id));
    const handleDeleteMedia = (id) => {
        setDeletedMediaIds(prev => new Set(prev).add(id));
        setMediaOrderIds(prev => prev.filter(mediaId => mediaId !== id));
        // 触发外部删除连线的回调
        onRemoveConnection(id, anchorNode.id);
        // 💡 提示：这里仅仅是面板层面的视觉删除。
        // 如果你希望用户点击删除时，连画布上的连线也一起断掉，可以在这里触发一个外部传进来的 props（比如 onRemoveEdge(id)）
    };

    // 状态中心：只管理业务数据，不再有面条般的 useEffect
    const { params, updateParam, syncToNode, config } = useGenerationParams(
        anchorNode, mode, updateNodeData, inputPicturesCount, hasMediaInput
    );
    const handleUpdateParam = (key, val) => {
        // 1. 正常执行：更新面板 UI 状态 (按钮高亮切换)
        updateParam(key, val);

        // 2. 拦截并打穿到画布：如果是修改比例，且不是自适应或自由模式
        if (key === 'aspectRatio' && val !== 'auto' && val !== 'free') {
            // 以 360 为基准计算新宽高
            const newSize = getDimensionsByRatio(val, 360);
            
            // 直接调用父级传进来的 updateNodeData，让画布上的 NodeWrapper 发生物理形变
            updateNodeData(anchorNode.id, { 
                size: newSize,
                // 顺手将最新的比例参数提前写进节点数据，保证数据一致性
                generation: { 
                    ...(anchorNode.generation || {}), 
                    aspect_ratio: val 
                }
            });
        }
    };
    // UI 交互状态
    const [prompt, setPrompt] = useState(anchorNode.generation?.prompt ?? '');

    // ✅ 1. 新增：用 ref 实时追踪最新的 prompt 文字，打破闭包陷阱
    const promptRef = useRef(prompt);
    useEffect(() => {
        promptRef.current = prompt;
    }, [prompt]);

    // ✅ 2. 新增：将卸载时的保存逻辑交还给主面板
    useEffect(() => {
        return () => {
            // 面板关闭时，把 ref 里最新的文字静默保存进节点
            syncToNode({ prompt: promptRef.current }); 
        };
    }, [syncToNode]);
    
    const [activePopover, setActivePopover] = useState(null);
    const popoverRef = useRef(null);

    // 发送逻辑 (组装最终的 Prompt)
    const handleSend = () => { 
        if (!prompt && mode !== 'video') return; 
        setActivePopover(null);
        syncToNode({ prompt }); // 保存原始包含 @ 的短文本
        
        // 💡 优化：使用字典映射，将 @视1 转为 视频1，@音1 转为 音频1，保持 图1 不变
        const typeMap = { '图': '图', '视': '视频', '音': '音频' };
        const cleanPrompt = prompt.replace(/@([图视音])(\d+)/g, (_, type, num) => {
            return `${typeMap[type]}${num}`;
        });
        
        const finalPrompt = mode === 'image' 
            ? buildPresetPrompt(cleanPrompt, params.gridMode, params.imageStyle) 
            : cleanPrompt;

        const formattedInputs = inputMedia.map(n => {
            let baseType = 'image';
            if (n.type.includes('video')) baseType = 'video';
            if (n.type.includes('audio')) baseType = 'audio';
            return { url: n.src, type: baseType };
        }).filter(media => Boolean(media.url));

        onGenerate({ 
            ...params,
            prompt: finalPrompt,        
            rawPrompt: prompt,          
            model: mode === 'image' ? params.imageModel : params.videoModel, 
            nodeId: anchorNode.id,
            apiMode: mode === 'video' ? params.videoRefMode : 'imageRefMode',
            inputs: formattedInputs
        }); 
    };

    // 全局点击外部关闭弹窗
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) setActivePopover(null);
        };
        if (activePopover) document.addEventListener('pointerdown', handleClickOutside, true);
        return () => document.removeEventListener('pointerdown', handleClickOutside, true);
    }, [activePopover]);

    const stopInteraction = (e) => e.stopPropagation();

    return (
        <div data-panel-for={anchorNode.id}
             className="no-wheel no-drag absolute top-0 left-0 w-[520px] bg-[#212121] rounded-3xl shadow-[0_24px_60px_-15px_rgba(0,0,0,0.9)] border border-white/10 flex flex-col z-[100] p-4 pointer-events-auto" 
             style={panelStyle} onPointerDown={stopInteraction} onWheel={stopInteraction}>
            

            {/* 顶部视频模式切换 Tabs  */}
            {mode === 'video' && (
                <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar">
                    {VIDEO_REFERENCE_MODES.map(m => {
                        const isFirstLast = m.value === 'first_last';
                        // 逻辑：含媒体或图片≥3张时，禁用首尾帧
                        const isDisabled = isFirstLast && (inputMedia.length >= 3 || hasMediaInput);
                        const isActive = params.videoRefMode === m.value;

                        return (
                            <button
                                key={m.value}
                                disabled={isDisabled}
                                onClick={() => updateParam('videoRefMode', m.value)}
                                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[13px] font-medium transition-all border ${
                                    isActive 
                                        ? 'bg-[#333] text-white border-neutral-500 shadow-sm' 
                                        : 'bg-transparent text-neutral-400 border-white/5 hover:bg-[#2a2a2a] hover:text-neutral-200'
                                } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                                {m.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 顶栏：输入媒体引用标签 */}
            {inputMedia.length > 0 && (
                <PictureTags 
                    pictures={inputMedia} 
                    mode={mode} // 👈 必须传：因为只在 video 模式下才显示标签
                    videoRefMode={params.videoRefMode} // 👈 必须传：告诉它现在是首尾还是多图
                    onReorder={handleReorder}
                    onDelete={handleDeleteMedia}
                />
            )}

            {/* 中间：自适应高阶输入框 (@ 联想引擎) */}
            <MentionTextarea 
                prompt={prompt} 
                setPrompt={setPrompt} 
                mode={mode} 
                inputMedia={inputMedia} 
                onSend={handleSend} 
            />

            {/* 底栏：模型与参数控制条 */}
            <div ref={popoverRef} className="relative">
                <ControlToolbar 
                    mode={mode}
                    params={params}
                    config={config}
                    updateParam={handleUpdateParam}
                    activePopover={activePopover}
                    setActivePopover={setActivePopover}
                    onSend={handleSend}
                    isLoading={anchorNode._isLoading}
                    isPromptEmpty={!prompt}
                    inputPictureCount={inputPicturesCount} 
                    hasMediaInput={hasMediaInput}
                />
            </div>
        </div>
    );
}