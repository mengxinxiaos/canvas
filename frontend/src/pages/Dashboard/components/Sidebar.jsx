// components/Sidebar.jsx
import React, { useState } from 'react';
import { LogOut, Settings, User as UserIcon, Shield, LayoutDashboard, Activity } from 'lucide-react';
import UserManagementPage from './UserManagementPage'; 
import ApiUsagePanel from './ApiUsagePanel';

export default function Sidebar({ currentUser, onLogout }) {
    const [showUserModal, setShowUserModal] = useState(false);
    const [showUsagePanel, setShowUsagePanel] = useState(false);

    if (!currentUser) return null;
    const isAdmin = currentUser.role === 'admin';

    // 内部的退出二次确认
    const handleLogoutClick = () => {
        if (typeof onLogout === 'function') {
            onLogout();
        }
    };

    return (
        <>
            {/* 侧边栏主体：固定在左侧，默认 72px，hover 时展开到 w-64 (256px) */}
            <aside className="fixed left-0 top-0 h-screen w-[72px] hover:w-64 group bg-[#111111] border-r border-white/[0.06] transition-all duration-300 ease-in-out z-50 flex flex-col hover:shadow-2xl overflow-hidden">
                
                {/* 1. 顶部 Logo 区域 */}
                <div className="h-24 flex items-center shrink-0 pl-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
                        {/* 这里你可以换成你们自己的 Logo 图片 */}
                        <span className="text-black font-bold text-xl">AI</span>
                    </div>
                    {/* 文字：默认透明，hover时浮现 */}
                    <span className="ml-3 text-white font-bold text-lg tracking-wide opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300">
                        无限画布
                    </span>
                </div>

                {/* 2. 主导航区（未来可以加更多菜单） */}
                <div className="flex-1 px-3 flex flex-col gap-2 mt-4">
                    {/* 当前选中的菜单项 */}
                    <button className="flex items-center w-full h-11 rounded-xl bg-white/[0.08] text-white overflow-hidden shrink-0">
                        <div className="w-[48px] flex items-center justify-center shrink-0">
                            <LayoutDashboard size={20} />
                        </div>
                        <span className="text-sm font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300">
                            项目空间
                        </span>
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setShowUsagePanel(true)}
                            className="flex items-center w-full h-11 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors overflow-hidden shrink-0"
                            title="API 调用与费用"
                        >
                            <div className="w-[48px] flex items-center justify-center shrink-0"><Activity size={20} /></div>
                            <span className="text-sm font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300">调用与费用</span>
                        </button>
                    )}
                </div>

                {/* 3. 底部用户与操作区 */}
                <div className="p-3 border-t border-white/[0.06] flex flex-col gap-2 shrink-0">
                    
                    {isAdmin && (
                        <button
                            onClick={() => setShowUserModal(true)}
                            className="flex items-center w-full h-11 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors overflow-hidden shrink-0"
                            title="系统管理"
                        >
                            <div className="w-[48px] flex items-center justify-center shrink-0">
                                <Settings size={20} />
                            </div>
                            <span className="text-sm font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300">
                                系统管理
                            </span>
                        </button>
                    )}

                    <button
                        onClick={handleLogoutClick}
                        className="flex items-center w-full h-11 rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors overflow-hidden shrink-0"
                        title="退出登录"
                    >
                        <div className="w-[48px] flex items-center justify-center shrink-0">
                            <LogOut size={20} />
                        </div>
                        <span className="text-sm font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300">
                            退出登录
                        </span>
                    </button>

                    {/* 用户身份信息卡片 */}
                    <div className="mt-2 flex items-center w-full h-14 rounded-xl bg-black/40 border border-white/[0.05] overflow-hidden shrink-0 cursor-default">
                        <div className="w-[48px] flex items-center justify-center shrink-0">
                            <div className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center text-white/50 border border-white/10">
                                <UserIcon size={16} />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0 pr-3 opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity duration-300">
                            <div className="text-sm font-medium text-white/90 truncate">
                                {currentUser.displayName || currentUser.username || '未知用户'}
                            </div>
                            <div className="text-[11px] text-white/40 flex items-center gap-1 mt-0.5">
                                {isAdmin && <Shield size={10} className="text-blue-400"/>}
                                {isAdmin ? '系统管理员' : '普通成员'}
                            </div>
                        </div>
                    </div>

                </div>
            </aside>

            {/* 管理弹窗 */}
            {isAdmin && showUserModal && (
                <UserManagementPage
                    currentUser={currentUser}
                    onClose={() => setShowUserModal(false)}
                />
            )}
            {isAdmin && showUsagePanel && (
                <ApiUsagePanel currentUser={currentUser} onClose={() => setShowUsagePanel(false)} />
            )}
        </>
    );
}
