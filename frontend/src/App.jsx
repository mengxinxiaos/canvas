import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { authService } from './services/api';
import LoginScreen from './pages/LoginScreen';
//import Dashboard from './pages/Dashboard';
import Dashboard from './pages/Dashboard/dashboard';
//import Workspace from './components/canvas/main-canvas/Workspace';
import TapnowCanvas from './components/canvas/TapnowCanvas';

export default function App() {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [currentProjectId, setCurrentProjectId] = useState(null);

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('tapnow_token');
            if (!token) { setAuthLoading(false); return; }
            try {
                const userData = await authService.getMe();
                setUser(userData);
                const urlParams = new URLSearchParams(window.location.search);
                const sharedProjectId = urlParams.get('projectId');
                if (sharedProjectId) setCurrentProjectId(sharedProjectId);
            } catch (err) {
                console.error("Auth init error", err);
                localStorage.removeItem('tapnow_token');
            } finally {
                setAuthLoading(false);
            }
        };
        initAuth();
    }, []);
    
    const handleLogout = () => {
        if (window.confirm("确定要退出登录吗？")) {
            authService.logout(); 
        }
    };
    
    if (authLoading) return <div className="w-full h-screen flex items-center justify-center bg-neutral-900"><Loader2 className="animate-spin text-blue-500" size={32} /></div>;
    if (!user) return <LoginScreen onLoginSuccess={setUser} />;

    return (
        <div className="w-full h-screen font-sans text-neutral-800 bg-[#0a0a0a]">
            {currentProjectId ? (
                <TapnowCanvas 
                    user={user} 
                    projectId={currentProjectId} 
                    onBack={() => { setCurrentProjectId(null); window.history.pushState({}, '', window.location.pathname); }} 
                />
            ) : (
                <Dashboard 
                    user={user} 
                    onOpenProject={setCurrentProjectId} 
                    onLogout={handleLogout} 
                />
            )}
        </div>
    );
}