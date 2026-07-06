// frontend/src/components/agent/agentUiClassNames.js

export function cx(...items) {
    return items
        .flat()
        .filter(Boolean)
        .join(' ');
}

export const agentUi = {
    // ============================================================
    // Root / Layer
    // ============================================================
    rootFloating:
        'absolute z-[420] no-drag no-wheel pointer-events-none right-3 bottom-3 left-3 h-[72vh] md:left-auto md:top-20 md:right-6 md:bottom-6 md:h-auto flex flex-col items-end justify-end',

    // ============================================================
    // Surface
    // 统一原则：
    // 1. Agent 主面板、弹窗、菜单全部使用不透明背景
    // 2. 不使用 bg-xxx/80、bg-xxx/95、backdrop-blur 做主要底色
    // 3. 避免下方画布文字、节点、线条透出来
    // ============================================================
    panel:
        'pointer-events-auto relative w-full md:w-[clamp(380px,30vw,560px)] max-w-[calc(100vw-24px)] h-full min-h-[420px] bg-[#171717] border border-[#2f2f2f] rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.72)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200',
    
        panelHeader:
        'h-14 px-4 border-b border-[#2a2a2a] bg-[#171717] flex items-center justify-between shrink-0',

    panelBody:
        'flex-1 overflow-hidden bg-[#171717]',

    sidebarOverlay:
        'absolute inset-0 z-10 bg-[#171717] flex flex-col',

    composer:
        'relative p-3 border-t border-[#2a2a2a] bg-[#171717]',

    composerBox:
    'flex flex-col gap-2 bg-[#242424] border border-[#343434] rounded-2xl px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',

    composerToolbar:
        'flex items-center justify-between gap-2',

    composerToolbarLeft:
        'flex items-center gap-2 min-w-0',

    textarea:
        'w-full resize-none bg-transparent outline-none text-sm text-neutral-100 placeholder:text-neutral-500 max-h-[120px] leading-6 disabled:opacity-50',

    // ============================================================
    // Popover / Menu
    // ============================================================
    popover:
        'absolute z-40 rounded-2xl border border-[#373737] bg-[#202020] shadow-[0_18px_60px_rgba(0,0,0,0.78)] overflow-hidden',

    popoverWide:
    'absolute left-3 right-3 bottom-[76px] z-40 rounded-2xl border border-[#373737] bg-[#202020] shadow-[0_18px_60px_rgba(0,0,0,0.78)] overflow-hidden',

    popoverNarrow:
        'absolute left-3 bottom-[76px] z-30 w-[280px] rounded-2xl border border-[#373737] bg-[#202020] shadow-[0_18px_60px_rgba(0,0,0,0.78)] overflow-hidden',

    popoverHeader:
        'px-3 py-3 border-b border-[#303030] bg-[#202020]',

    popoverFooter:
        'px-3 py-2 border-t border-[#303030] bg-[#202020]',

    popoverScroll:
        'max-h-[280px] overflow-y-auto no-scrollbar p-2 bg-[#202020]',

    menuSectionLabel:
        'px-3 py-2 text-[11px] text-neutral-500 border-b border-[#303030] bg-[#202020]',

    // ============================================================
    // Items
    // ============================================================
    menuItem:
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors text-neutral-200 hover:bg-[#2b2b2b]',

    menuItemActive:
        'bg-[#2f2f2f] text-white',

    menuItemDisabled:
        'opacity-45 cursor-not-allowed text-neutral-500 hover:bg-transparent',

    iconBox:
        'w-8 h-8 shrink-0 rounded-xl bg-[#2b2b2b] border border-[#383838] flex items-center justify-center text-neutral-300',

    skillIconBox:
        'w-8 h-8 shrink-0 rounded-xl bg-[#1f2b3f] border border-blue-400/20 text-blue-300 flex items-center justify-center',

    // ============================================================
    // Buttons
    // ============================================================
    iconButton:
        'p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-[#2a2a2a] transition-colors',

    composerAddButton:
        'w-9 h-9 shrink-0 rounded-full text-neutral-300 hover:text-white hover:bg-[#323232] flex items-center justify-center active:scale-95 transition-all disabled:opacity-40',

    sendButton:
        'w-9 h-9 shrink-0 rounded-full bg-neutral-200 text-black flex items-center justify-center hover:bg-white active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed',

    launcherButtonBase:
        'w-14 h-14 rounded-2xl border shadow-2xl flex items-center justify-center transition-all bg-[#1f1f1f] border-[#343434] text-neutral-200 hover:bg-[#2a2a2a] hover:text-white hover:scale-105 active:scale-95',

    launcherButtonOpen:
        'bg-blue-600 text-white border-blue-400/40',
    launcherDock:
        'pointer-events-auto',

    // ============================================================
    // Text / Status
    // ============================================================
    titleText:
        'text-sm font-semibold text-white leading-none truncate max-w-[220px]',

    subtitleText:
        'text-[11px] text-neutral-500 mt-1',

    mutedText:
        'text-neutral-500',

    errorBox:
        'mx-4 mt-3 px-3 py-2 rounded-2xl bg-[#2a1717] border border-red-500/25 text-red-300 text-xs flex items-start gap-2',

    // ============================================================
    // Messages
    // ============================================================
    messageList:
        'flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-4 bg-[#171717]',

    messageBubbleUser:
        'max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-blue-600 text-white rounded-br-md',

    messageBubbleAssistant:
        'max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words bg-[#2a2a2a] text-neutral-100 border border-[#363636] rounded-bl-md',

    loadingBubble:
        'bg-[#2a2a2a] border border-[#363636] text-neutral-300 rounded-2xl rounded-bl-md px-4 py-3 text-sm flex items-center gap-2',

    // ============================================================
    // Chips
    // ============================================================
    chip:
        'px-2 py-1 rounded-full bg-[#1f2b3f] border border-blue-400/20 text-blue-200 text-[11px] flex items-center gap-1 hover:bg-[#263957] transition-colors',

    chipSelected:
        'w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0',

    // ============================================================
    // Inputs
    // ============================================================
    searchInputWrap:
        'h-8 rounded-xl bg-[#292929] border border-[#383838] px-2 flex items-center gap-2',

    searchInput:
        'flex-1 bg-transparent outline-none text-sm text-neutral-100 placeholder:text-neutral-500',

    // ============================================================
    // Utility interaction guards
    // ============================================================
    stopLayer:
        'no-drag no-wheel pointer-events-auto',

    // ============================================================
    // Model Select
    // ============================================================
    modelSelectRoot:
        'relative shrink-0',

    modelSelectButton:
        'h-9 max-w-[132px] px-2.5 rounded-full bg-[#2b2b2b] border border-[#3a3a3a] text-neutral-200 hover:text-white hover:bg-[#323232] flex items-center gap-1.5 transition-colors active:scale-95 disabled:opacity-40',

    modelSelectButtonActive:
        'bg-[#1f2b3f] border-blue-400/25 text-blue-200',

    modelSelectLabel:
        'text-[12px] font-medium truncate max-w-[82px]',

    modelSelectPopover:
        'absolute left-0 bottom-[44px] z-50 w-[300px] rounded-2xl border border-[#373737] bg-[#202020] shadow-[0_18px_60px_rgba(0,0,0,0.78)] overflow-hidden',

    modelSelectHeader:
        'px-3 py-2.5 border-b border-[#303030] bg-[#202020] flex items-center justify-between',

    modelSelectItem:
        'w-full px-3 py-3 flex items-start gap-3 text-left hover:bg-[#2b2b2b] transition-colors',

    modelSelectItemActive:
        'bg-[#1f2b3f]',

    modelProviderPill:
        'px-1.5 py-0.5 rounded-md bg-[#2b2b2b] border border-[#3a3a3a] text-[10px] text-neutral-400 uppercase',
};