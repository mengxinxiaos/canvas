import React, { useState, useEffect } from 'react';
import { Users, Trash2, User as UserIcon, X, Loader2, UserPlus, ArrowLeft, Check } from 'lucide-react';
import { authService } from '../../../services/api';

export default function UserManagementPage({ onClose, currentUser }) {
    // 视图状态：'list' | 'add'
    const [view, setView] = useState('list');
    
    // 列表状态
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // 新增用户状态
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [addLoading, setAddLoading] = useState(false);
    const [addMsg, setAddMsg] = useState({ type: '', text: '' });

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await authService.fetchUsers();
            setUsers(data);
        } catch (err) {
            alert("无法加载用户列表");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, []);

    // --- 列表操作逻辑 ---
    const handleDelete = async (userId) => {
        if (userId === currentUser.id) return alert("不能删除自己！");
        if (!window.confirm("确定要删除该用户吗？此操作不可逆！")) return;
        
        try {
            await authService.deleteUser(userId);
            setUsers(users.filter(u => u.id !== userId));
        } catch (err) {
            alert("删除失败: " + err.message);
        }
    };

    const handleRoleChange = async (userId, newRole) => {
        if (userId === currentUser.id) return; 
        try {
            await authService.updateUser(userId, { role: newRole });
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (err) {
            alert("角色修改失败");
        }
    };

    // --- 新增用户逻辑 ---
    const handleCreateUser = async (e) => {
        e.preventDefault();
        setAddLoading(true); setAddMsg({ type: '', text: '' });
        try {
            // 调用你 api.js 中的开通接口
            await authService.adminCreateUser(newUsername, newPassword);
            setAddMsg({ type: 'success', text: '✅ 账号开通成功！' });
            setNewUsername('');
            setNewPassword('');
            
            // 重新加载列表，并在 1.5 秒后自动切回列表页
            loadUsers();
            setTimeout(() => {
                setView('list');
                setAddMsg({ type: '', text: '' });
            }, 1500);
            
        } catch (err) {
            setAddMsg({ type: 'error', text: `❌ 失败: ${err.message}` });
        } finally {
            setAddLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                
                {/* 头部 */}
                <div className="flex items-center justify-between p-6 border-b border-neutral-800 bg-neutral-900/50 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        {view === 'add' ? (
                            <button onClick={() => setView('list')} className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition-colors">
                                <ArrowLeft size={20} />
                            </button>
                        ) : (
                            <div className="p-2 bg-blue-500/20 rounded-xl"><Users className="text-blue-400" size={24}/></div>
                        )}
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {view === 'add' ? '开通员工账号' : '用户与权限管理'}
                            </h2>
                            <p className="text-sm text-neutral-400">
                                {view === 'add' ? '为新成员分配系统登录凭证' : '管理系统内所有账户及访问权限'}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {view === 'list' && (
                            <button onClick={() => setView('add')} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                                <UserPlus size={16} /> 新增用户
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* 内容区 */}
                <div className="flex-1 overflow-y-auto p-6">
                    {view === 'list' ? (
                        /* --- 列表视图 --- */
                        loading ? (
                            <div className="flex justify-center items-center h-40 text-neutral-500"><Loader2 className="animate-spin mr-2"/> 加载用户数据...</div>
                        ) : (
                            <div className="border border-neutral-800 rounded-2xl overflow-hidden bg-neutral-900/50">
                                <table className="w-full text-left text-sm text-neutral-300">
                                    <thead className="bg-neutral-800/80 text-neutral-400 font-medium">
                                        <tr>
                                            <th className="px-6 py-4">用户名 / 昵称</th>
                                            <th className="px-6 py-4">角色权限</th>
                                            <th className="px-6 py-4">加入时间</th>
                                            <th className="px-6 py-4 text-right">操作</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800/50">
                                        {users.map(u => (
                                            <tr key={u.id} className="hover:bg-neutral-800/40 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400">
                                                            <UserIcon size={16} />
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-white flex items-center gap-2">
                                                                {u.username} 
                                                                {u.id === currentUser.id && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">我自己</span>}
                                                            </div>
                                                            <div className="text-xs text-neutral-500">{u.displayName}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select 
                                                        value={u.role}
                                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                        disabled={u.id === currentUser.id}
                                                        className="bg-neutral-900 border border-neutral-700 text-neutral-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 disabled:opacity-40 cursor-pointer"
                                                    >
                                                        <option value="user">普通用户</option>
                                                        <option value="admin">管理员</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 text-neutral-500">
                                                    {u.createdAt ? new Date(u.createdAt * 1000).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button 
                                                        onClick={() => handleDelete(u.id)}
                                                        disabled={u.id === currentUser.id}
                                                        className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                                                        title={u.id === currentUser.id ? "不能删除自己" : "删除用户"}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : (
                        /* --- 新增视图 --- */
                        <div className="max-w-md mx-auto py-8">
                            {addMsg.text && (
                                <div className={`mb-6 p-4 text-sm rounded-2xl flex items-center gap-2 ${addMsg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                    {addMsg.text}
                                </div>
                            )}
                            <form onSubmit={handleCreateUser} className="flex flex-col gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">登录用户名</label>
                                    <input type="text" placeholder="如: zhangsan" value={newUsername} onChange={e=>setNewUsername(e.target.value)} required className="w-full px-4 py-3 bg-neutral-900/50 border border-neutral-700 rounded-xl text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-2">初始密码</label>
                                    <input type="text" placeholder="建议设置默认密码, 如 123456" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required className="w-full px-4 py-3 bg-neutral-900/50 border border-neutral-700 rounded-xl text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all" />
                                </div>
                                <div className="mt-4 flex gap-3">
                                    <button type="button" onClick={() => setView('list')} className="flex-1 py-3 text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-xl font-medium transition-colors">
                                        取消
                                    </button>
                                    <button type="submit" disabled={addLoading} className="flex-1 bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70">
                                        {addLoading ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18}/> 立即开通</>}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}