import React, { useId } from 'react';
import {
    ArrowUp, Loader2, Video, Settings2, AlertTriangle,
    Info, Maximize, LayoutGrid
} from 'lucide-react';
import Popover from '../../../ui/Popover';
import { getManualDurations } from '../utils/generationParams';
import { IMAGE_MODELS, VIDEO_MODELS, GRID_MODES, IMAGE_STYLES, getAvailableModelsByMode } from '../../../../config/constants';

/**
 * 内部私有小组件：比例图标渲染器
 */
const RatioIcon = ({ ratio, isActive }) => {
    let w = 14, h = 14;
    // 💡 修复：安全回退使用原生字符串 'auto' 和 'free'，防止匹配失败导致崩溃
    if (ratio !== 'auto' && ratio !== 'free') {
        const [rw, rh] = ratio.split(':').map(Number);
        if (rw > rh) { w = 16; h = Math.max(16 * (rh / rw), 6); }
        else if (rh > rw) { h = 16; w = Math.max(16 * (rw / rh), 6); }
    }
    return (
        <div className="h-5 flex items-center justify-center">
            <div className={`border-[1.5px] rounded-[2px] transition-all duration-200 ${isActive ? 'border-white' : 'border-neutral-500'}`} style={{ width: w, height: h }} />
        </div>
    );
};

/**
 * 内部私有小组件：工具栏标准按钮
 * 🚀 修复了高度塌陷和 Flex 间距问题，完美还原原版的精致布局
 */
const ToolbarButton = ({ onClick, isActive, icon, label, extraData }) => (
    <button
        onClick={onClick}
        tabIndex={0}
        // 强制写死 h-[38px] 防止被父级挤压
        className={`h-[38px] px-3.5 rounded-xl flex items-center gap-2 text-[13px] font-medium transition-all border outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isActive ? 'bg-[#333] border-neutral-500 text-white' : 'bg-[#2a2a2a] border-white/5 text-neutral-300 hover:bg-[#333]'
        }`}
    >
        {/* 恢复你原本的嵌套结构，让 icon 和 label 紧凑贴合 (gap-1.5) */}
        <div className="flex items-center gap-1.5">
            {icon}
            <span className="truncate max-w-[80px]">{label}</span>
        </div>
        {/* 恢复你原本的圆点间距 */}
        {extraData && <span className="text-neutral-600">·</span>}
        {extraData && <span>{extraData}</span>}
    </button>
);

export default function ControlToolbar({
    mode, params, config, updateParam,
    activePopover, setActivePopover, onSend, isLoading, isPromptEmpty, isSendBlocked = false
}) {

    const isImageMode = mode === 'image';
    const isAutoRatio = params.aspectRatio === 'auto';

    // 模型选择逻辑
    const availableModels = isImageMode
        ? IMAGE_MODELS
        : getAvailableModelsByMode('video', params.videoRefMode);

    const currentModelLabel = isImageMode
        ? IMAGE_MODELS.find(m => m.value === params.imageModel)?.label?.replace(' ✨NEW', '')
        : VIDEO_MODELS.find(m => m.value === params.videoModel)?.label;

    const isSendDisabled = isLoading || isSendBlocked || (isPromptEmpty && mode !== 'video');

    return (
        <div className="flex flex-wrap items-start justify-between gap-2 px-1 relative">
            <div className="flex flex-wrap items-center gap-2 min-w-0">

                {/* 1. 模型选择 */}
                <Popover
                    width="220px"
                    isOpen={activePopover === 'model'}
                    onClose={() => setActivePopover(null)}
                    trigger={
                        <ToolbarButton
                            onClick={() => setActivePopover('model')}
                            isActive={activePopover === 'model'}
                            icon={isImageMode ? <Settings2 size={14} className="text-blue-400"/> : <Video size={14} className="text-purple-400"/>}
                            label={currentModelLabel || '选择模型'}
                        />
                    }
                >
                    <div className="p-1.5 flex flex-col">
                        {availableModels.map(m => (
                            <button
                                key={m.value}
                                onClick={() => { updateParam(isImageMode ? 'imageModel' : 'videoModel', m.value); setActivePopover(null); }}
                                tabIndex={0}
                                className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors flex items-center justify-between outline-none focus:bg-[#333] ${(isImageMode ? params.imageModel : params.videoModel) === m.value ? 'bg-blue-500/10 text-blue-400' : 'hover:bg-[#333] text-neutral-300'}`}
                            >
                                {m.label.replace(' ✨NEW', '')}
                                {m.label.includes('NEW') && <span className="bg-blue-500 text-white text-[9px] px-1.5 py-0.5 rounded-md">NEW</span>}
                            </button>
                        ))}
                    </div>
                </Popover>

                {/* 2. 核心参数 (尺寸/比例/时长) */}
                <Popover
                    width="340px"
                    isOpen={activePopover === 'params'}
                    onClose={() => setActivePopover(null)}
                    trigger={
                        <ToolbarButton
                            onClick={() => setActivePopover('params')}
                            isActive={activePopover === 'params'}
                            // 💡 修复：完美恢复自适应图标和文字的判断逻辑
                            icon={isImageMode && isAutoRatio ? <Maximize size={12}/> : <RatioIcon ratio={params.aspectRatio} isActive={false} />}
                            label={isAutoRatio ? '自适应' : params.aspectRatio}
                            extraData={isImageMode ? params.imageSize : `${params.resolution} · ${params.duration === '-1' ? '自动' : params.duration+'s'}`}
                        />
                    }
                >
                    <div className="p-4 text-neutral-200">
                        {isImageMode ? (
                            <>
                                <Section title="画质" items={config.sizes} current={params.imageSize} onSelect={(val) => updateParam('imageSize', val)} />
                                <div className="mt-4">
                                    <div className="text-xs text-neutral-400 mb-2.5 font-medium">比例</div>
                                    <div className="flex gap-2 items-stretch">
                                        {config.ratios.includes('auto') && (
                                            <RatioBtn isFixed icon={<Maximize size={20}/>} label="自适应" isActive={params.aspectRatio === 'auto'} onClick={() => updateParam('aspectRatio', 'auto')} />
                                        )}
                                        <div className="grid grid-cols-4 gap-1.5 flex-1">
                                            {config.ratios.filter(r => r !== 'auto').map(r => (
                                                <RatioBtn key={r} label={r} isActive={params.aspectRatio === r} onClick={() => updateParam('aspectRatio', r)} icon={<RatioIcon ratio={r} isActive={params.aspectRatio === r} />} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <Section title="比例" grid items={config.ratios} current={params.aspectRatio} onSelect={(val) => updateParam('aspectRatio', val)} isRatio />
                                <Section title="清晰度" items={config.resolutions} current={params.resolution} onSelect={(val) => updateParam('resolution', val)} />
                                <DurationControl durations={config.durations} current={params.duration} defaultDuration={config.defaultDuration} onSelect={(val) => updateParam('duration', val)} />
                            </>
                        )}
                    </div>
                </Popover>

                {/* 3. 预设 (仅 Image 模式) */}
                {isImageMode && (
                    <Popover
                        width="260px"
                        isOpen={activePopover === 'preset'}
                        onClose={() => setActivePopover(null)}
                        trigger={
                            <ToolbarButton
                                onClick={() => setActivePopover('preset')}
                                isActive={activePopover === 'preset'}
                                icon={<LayoutGrid size={14} className="text-pink-400"/>}
                                label={GRID_MODES.find(m => m.value === params.gridMode)?.label || '标准'}
                                extraData={IMAGE_STYLES.find(s => s.value === params.imageStyle)?.displayLabel || '自定义'}
                            />
                        }
                    >
                        <div className="p-4">
                            <Section title="生成模式" items={GRID_MODES} current={params.gridMode} onSelect={(val) => updateParam('gridMode', val)} useValue />
                            <Section title="画面风格" items={IMAGE_STYLES} current={params.imageStyle} onSelect={(val) => updateParam('imageStyle', val)} useValue />
                        </div>
                    </Popover>
                )}
            </div>

            {/* 发送按钮 */}
            <button
                onClick={onSend}
                disabled={isSendDisabled}
                type="button"
                aria-label={isLoading ? '正在生成' : '开始生成'}
                className={`w-[38px] h-[38px] shrink-0 rounded-full flex items-center justify-center transition-all shadow-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#212121] outline-none
                    ${isSendDisabled ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed' : 'bg-white text-black hover:scale-105 active:scale-95 cursor-pointer'}`}>
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
            </button>

            {/* 警告提示 */}
            {config.warning && (
                <div className="basis-full flex justify-center text-[11px] text-neutral-500 opacity-80 font-medium pointer-events-none">
                    <span className={`flex items-center gap-1.5 ${config.warning.color || ''}`}>
                        {config.warning.icon === 'alert' ? <AlertTriangle size={12} className={config.warning.color ? "" : "text-amber-500/80"}/> : <Info size={12}/>}
                        {config.warning.text}
                    </span>
                </div>
            )}
        </div>
    );
}

/**
 * 局部辅助组件：参数选择区块
 */
function Section({ title, items, current, onSelect, format, grid, isRatio, useValue }) {
    return (
        <div className={grid ? "mb-4" : "mb-4 last:mb-0"}>
            <div className="text-xs text-neutral-400 mb-2.5 font-medium">{title}</div>
            <div className={grid ? "grid grid-cols-6 gap-1.5" : "flex flex-wrap bg-[#1a1a1a] p-1 rounded-xl border border-white/5 gap-1"}>
                {items.map(item => {
                    const val = useValue ? item.value : item;
                    const label = useValue ? item.label : (format ? format(item) : item);
                    const isActive = current === val;
                    return (
                        <button key={val} onClick={() => onSelect(val)} tabIndex={0}
                            className={`py-1.5 text-xs font-medium rounded-lg transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${grid ? 'flex flex-col items-center border' : 'flex-1'} ${
                                isActive ? 'bg-[#333] border-neutral-500 text-white shadow-sm' : 'bg-transparent text-neutral-500 border-transparent hover:text-neutral-300'
                            }`}>
                            {isRatio && <RatioIcon ratio={val} isActive={isActive} />}
                            <span className={isRatio ? "mt-0.5 text-[10px]" : ""}>{label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function RatioBtn({ icon, label, isActive, onClick, isFixed }) {
    return (
        <button onClick={onClick} tabIndex={0}
            className={`flex flex-col items-center justify-center rounded-xl border transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50
            ${isActive ? 'bg-[#333] border-neutral-500 text-white' : 'bg-[#1a1a1a] border-transparent text-neutral-500 hover:bg-[#2a2a2a]'}
            ${isFixed ? 'w-[72px] shrink-0' : 'py-1.5 w-full'}`}>
            {/* 👆 如果 isFixed 为 true 则固定宽度 72px，否则用 w-full 完美填满 grid 单元格 */}
            <div className={icon ? "mb-1.5" : "mb-0.5"}>{icon}</div>
            <span className="text-[10px] font-medium">{label}</span>
        </button>
    );
}
/** A bounded control driven by model options, rather than one button per second. */
function DurationControl({ durations, current, defaultDuration, onSelect }) {
    const sliderId = useId();
    const values = getManualDurations(durations);
    const isAuto = current === '-1';
    const supportsAuto = durations.includes('-1');
    const fallbackIndex = Math.max(0, values.indexOf(String(defaultDuration)));
    const currentIndex = values.indexOf(String(current));
    const sliderIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const sliderValue = values[sliderIndex];

    return (
        <div>
            <div className="flex items-center justify-between mb-2.5">
                <label htmlFor={sliderId} className="text-xs text-neutral-400 font-medium">生成时长</label>
                <output htmlFor={sliderId} className="text-xs text-neutral-200 tabular-nums">{isAuto ? '自动' : `${current}s`}</output>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#1a1a1a] px-3 py-2.5">
                {supportsAuto && (
                    <button type="button" aria-pressed={isAuto} onClick={() => onSelect('-1')}
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isAuto ? 'bg-[#333] text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                        自动
                    </button>
                )}
                {values.length > 0 && (
                    <div className="flex-1 min-w-0">
                        <input id={sliderId} type="range" min="0" max={values.length - 1} step="1" value={sliderIndex}
                            aria-valuetext={`${sliderValue}秒${isAuto ? '，拖动可指定时长' : ''}`}
                            onChange={event => onSelect(values[Number(event.target.value)])}
                            className="block w-full h-5 cursor-pointer accent-blue-500 focus-visible:outline-blue-500" />
                        <div className="flex justify-between text-[10px] text-neutral-500 tabular-nums mt-1">
                            <span>{values[0]}s</span><span>{values[values.length - 1]}s</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
