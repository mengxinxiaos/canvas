import React, { useEffect, useRef, useState } from 'react';
import {
    Bot,
    X,
    Plus,
    History,
    MessageSquare,
    Sparkles,
    AlertCircle,
    Trash2,
    RefreshCw,
    Loader2,
    Image as ImageIcon,
} from 'lucide-react';

import AgentComposer from './AgentComposer';
import { agentUi, cx } from './agentUiClassNames';

const STARTER_PROMPTS = [
    '策划后续情节发展',
    '优化提示词',
    '推进项目流程',
];

function formatTime(ts) {
    if (!ts) return '';

    try {
        const date = new Date(ts * 1000);
        const now = new Date();

        const isToday =
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();

        if (isToday) {
            return date.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            });
        }

        return date.toLocaleDateString([], {
            month: '2-digit',
            day: '2-digit',
        });
    } catch {
        return '';
    }
}

function AgentLauncherButton({ isOpen, onClick }) {
    return (
        <button
            onClick={onClick}
            className={cx(
                agentUi.launcherButtonBase,
                isOpen && agentUi.launcherButtonOpen,
            )}
            title="打开画布Agent"
            type="button"
        >
            {isOpen ? <X size={24} /> : <Bot size={25} />}
        </button>
    );
}

function MessageAttachmentGrid({ attachments = [], isUser }) {
    if (!attachments?.length) return null;

    return (
        <div className="mb-2 flex gap-2 flex-wrap">
            {attachments.map((item, index) => {
                const key = item.id || item.nodeId || item.url || index;

                return (
                    <div
                        key={key}
                        className={cx(
                            'relative overflow-hidden rounded-xl border bg-neutral-900',
                            isUser
                                ? 'border-white/15'
                                : 'border-neutral-700/70',
                        )}
                        title={item.name || item.nodeId || '图片引用'}
                    >
                        {item.url ? (
                            <img
                                src={item.url}
                                alt=""
                                draggable={false}
                                className="w-24 h-24 object-cover"
                            />
                        ) : (
                            <div className="w-24 h-24 flex items-center justify-center text-neutral-500">
                                <ImageIcon size={20} />
                            </div>
                        )}

                        {item.source === 'canvas' && (
                            <div className="absolute left-1 bottom-1 px-1 py-0.5 rounded bg-black/65 text-[9px] text-neutral-200 leading-none">
                                画布
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function AgentMessageList({ messages, isLoading }) {
    const listRef = useRef(null);

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;

        el.scrollTop = el.scrollHeight;
    }, [messages, isLoading]);

    if (!messages || messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col justify-end px-5 pb-5 bg-[#171717]">
                <div className="mb-8">
                    <div className="flex items-center gap-2 text-neutral-300 text-xl mb-2">
                        <Sparkles size={20} className="text-neutral-400" />
                        <span>Hi Drocker!</span>
                    </div>

                    <div className="text-white text-2xl font-bold tracking-tight">
                        今天一起创作点什么？
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                    {STARTER_PROMPTS.map((text) => (
                        <div
                            key={text}
                            className="px-3 py-2.5 rounded-2xl bg-[#242424] border border-[#343434] text-sm text-neutral-200"
                        >
                            {text}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div
            ref={listRef}
            className={agentUi.messageList}
        >
            {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const attachments = Array.isArray(msg.attachments)
                    ? msg.attachments
                    : [];
                const hasText = Boolean(String(msg.content || '').trim());

                return (
                    <div
                        key={msg.id || `${msg.role}-${index}`}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={
                                isUser
                                    ? agentUi.messageBubbleUser
                                    : agentUi.messageBubbleAssistant
                            }
                        >
                            <MessageAttachmentGrid
                                attachments={attachments}
                                isUser={isUser}
                            />

                            {hasText ? (
                                <div className="whitespace-pre-wrap break-words">
                                    {msg.content}
                                </div>
                            ) : attachments.length > 0 ? null : (
                                <div className="text-neutral-500">
                                    {msg.status === 'streaming' ? ' ' : '空消息'}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {isLoading && (
                <div className="flex justify-start">
                    <div className={agentUi.loadingBubble}>
                        <Loader2 size={15} className="animate-spin" />
                        AI 正在思考...
                    </div>
                </div>
            )}
        </div>
    );
}

function AgentConversationSidebar({
    conversations,
    activeConversationId,
    isLoadingList,
    onClose,
    onRefresh,
    onOpenConversation,
    onNewConversation,
    onDeleteConversation,
}) {
    const handleDelete = async (conversationId) => {
        const ok = window.confirm('确定要删除这条 Agent 对话吗？');
        if (!ok) return;

        if (typeof onDeleteConversation !== 'function') {
            console.error('[Agent] onDeleteConversation 没有传入或不是函数');
            return;
        }

        try {
            await onDeleteConversation(conversationId);
        } catch (err) {
            console.error('[Agent] delete handler failed:', err);
        }
    };

    return (
        <div
            className={agentUi.sidebarOverlay}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
        >
            <div className={agentUi.panelHeader}>
                <div className="flex items-center gap-2 text-white font-semibold">
                    <History size={17} />
                    历史对话
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={onNewConversation}
                        className={agentUi.iconButton}
                        title="新对话"
                        type="button"
                    >
                        <Plus size={17} />
                    </button>

                    <button
                        onClick={onRefresh}
                        className={agentUi.iconButton}
                        title="刷新历史"
                        type="button"
                    >
                        <RefreshCw
                            size={17}
                            className={isLoadingList ? 'animate-spin' : ''}
                        />
                    </button>

                    <button
                        onClick={onClose}
                        className={agentUi.iconButton}
                        title="关闭历史"
                        type="button"
                    >
                        <X size={17} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-3 bg-[#171717]">
                {isLoadingList && (
                    <div className="flex items-center justify-center py-10 text-neutral-500 text-sm gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        正在加载历史...
                    </div>
                )}

                {!isLoadingList && (!conversations || conversations.length === 0) && (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8">
                        <div className="w-12 h-12 rounded-2xl bg-[#242424] border border-[#343434] flex items-center justify-center text-neutral-300 mb-4">
                            <MessageSquare size={22} />
                        </div>

                        <div className="text-white font-semibold mb-2">
                            暂无历史对话
                        </div>

                        <div className="text-sm text-neutral-500 leading-relaxed">
                            当前项目还没有 Agent 对话。发送第一条消息后，会自动创建一条项目级对话记录。
                        </div>
                    </div>
                )}

                {!isLoadingList && conversations && conversations.length > 0 && (
                    <div className="space-y-2">
                        {conversations.map((item) => {
                            const isActive = item.id === activeConversationId;

                            return (
                                <div
                                    key={item.id}
                                    className={cx(
                                        'group rounded-2xl border transition-colors overflow-hidden',
                                        isActive
                                            ? 'bg-[#1f2b3f] border-blue-400/30'
                                            : 'bg-[#202020] border-[#303030] hover:bg-[#252525]',
                                    )}
                                >
                                    <button
                                        onClick={() => onOpenConversation?.(item.id)}
                                        className="w-full text-left px-3 py-3"
                                        type="button"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-neutral-100 truncate">
                                                    {item.title || '新对话'}
                                                </div>

                                                <div className="text-[11px] text-neutral-500 mt-1">
                                                    {formatTime(item.updatedAt || item.createdAt)}
                                                </div>
                                            </div>

                                            {isActive && (
                                                <div className="text-[10px] text-blue-300 bg-blue-500/15 border border-blue-400/20 rounded-full px-2 py-0.5 shrink-0">
                                                    当前
                                                </div>
                                            )}
                                        </div>
                                    </button>

                                    <div className="px-2 pb-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleDelete(item.id);
                                            }}
                                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-300 hover:bg-red-500/10"
                                            title="删除对话"
                                            type="button"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function AgentChatPanel({
    title,

    chatState = {},
    chatActions = {},

    conversationState = {},
    conversationActions = {},

    skillState = {},
    skillActions = {},

    modelState = {},

    attachmentState = {},
    attachmentActions = {},

    showHistory,
    setShowHistory,
}) {
    const {
        messages = [],
        input = '',
        isLoading = false,
        isAgentBusy = false,
        error = '',
    } = chatState;

    const {
        setInput,
        onSend,
        onNewConversation,
        onClose,
    } = chatActions;

    const {
        conversations = [],
        activeConversationId,
        isLoadingList = false,
    } = conversationState;

    const {
        onRefreshConversations,
        onOpenConversation,
        onDeleteConversation,
    } = conversationActions;

    const {
        availableSkills = [],
        selectedSkillNames = [],
        isLoadingSkills = false,
        skillsError = '',
    } = skillState;

    const {
        addSkillName,
        removeSkillName,
        toggleSkillName,
        refreshSkills,
    } = skillActions;

    const {
        agentModelSelector,
    } = modelState;

    const {
        attachments = [],
        isPickingCanvasImages = false,
    } = attachmentState;

    const {
        onRemoveAttachment,
        onStartPickCanvasImages,
        onStopPickCanvasImages,
    } = attachmentActions;
    
    return (
        <div
            className={agentUi.panel}
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
        >
            <div className={agentUi.panelHeader}>
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#242424] border border-[#343434] flex items-center justify-center text-neutral-200 shrink-0">
                        <Bot size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className={agentUi.titleText}>
                            {title || 'Canvas Agent'}
                        </div>

                        <div className={agentUi.subtitleText}>
                            画布助手
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={onNewConversation}
                        className={agentUi.iconButton}
                        title="新对话"
                        type="button"
                    >
                        <Plus size={17} />
                    </button>

                    <button
                        onClick={() => setShowHistory(true)}
                        className={agentUi.iconButton}
                        title="历史对话"
                        type="button"
                    >
                        <History size={17} />
                    </button>

                    <button
                        onClick={onClose}
                        className={agentUi.iconButton}
                        title="关闭"
                        type="button"
                    >
                        <X size={17} />
                    </button>
                </div>
            </div>

            {error && (
                <div className={agentUi.errorBox}>
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <AgentMessageList
                messages={messages || []}
                isLoading={isLoading}
            />

            <AgentComposer
                value={input}
                onChange={setInput}
                onSend={onSend}
                disabled={isAgentBusy}

                availableSkills={availableSkills || []}
                selectedSkillNames={selectedSkillNames || []}
                onAddSkillName={addSkillName}
                onRemoveSkillName={removeSkillName}
                onToggleSkillName={toggleSkillName}
                isLoadingSkills={isLoadingSkills}
                skillsError={skillsError}
                onRefreshSkills={refreshSkills}

                agentModelSelector={agentModelSelector}

                attachments={attachments || []}
                onRemoveAttachment={onRemoveAttachment}
                onStartPickCanvasImages={onStartPickCanvasImages}
                onStopPickCanvasImages={onStopPickCanvasImages}
                isPickingCanvasImages={isPickingCanvasImages}
            />

            {showHistory && (
                <AgentConversationSidebar
                    conversations={conversations || []}
                    activeConversationId={activeConversationId}
                    isLoadingList={isLoadingList}
                    onClose={() => setShowHistory(false)}
                    onRefresh={onRefreshConversations}
                    onOpenConversation={(conversationId) => {
                        onOpenConversation?.(conversationId);
                        setShowHistory(false);
                    }}
                    onNewConversation={() => {
                        onNewConversation?.();
                        setShowHistory(false);
                    }}
                    onDeleteConversation={onDeleteConversation}
                />
            )}
        </div>
    );
}

export default function CanvasAgentWidget({
    title,

    chatState = {},
    chatActions = {},

    conversationState = {},
    conversationActions = {},

    skillState = {},
    skillActions = {},

    modelState = {},

    attachmentState = {},
    attachmentActions = {},
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    return (
        <div
            className={agentUi.rootFloating}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
        >
            {isOpen ? (
                <AgentChatPanel
                    title={title}

                    chatState={chatState}
                    chatActions={{
                        ...chatActions,
                        onClose: () => setIsOpen(false),
                        onNewConversation: () => {
                            chatActions.onNewConversation?.();
                            setShowHistory(false);
                        },
                    }}

                    conversationState={conversationState}
                    conversationActions={conversationActions}

                    skillState={skillState}
                    skillActions={skillActions}

                    modelState={modelState}

                    attachmentState={attachmentState}
                    attachmentActions={attachmentActions}

                    showHistory={showHistory}
                    setShowHistory={setShowHistory}
                />
            ) : (
                <div className={agentUi.launcherDock}>
                    <AgentLauncherButton
                        isOpen={false}
                        onClick={() => setIsOpen(true)}
                    />
                </div>
            )}           
        </div>
    );
}