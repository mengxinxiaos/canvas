import React, { useState } from 'react';
import { Loader2, FolderKanban, ArrowRight, User, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { authService } from './../services/api';

function PremiumGlowButton({ children, loading, type }) {
  return (
    <motion.button
      type={type}
      disabled={loading}
      whileHover={{ scale: 1.01, y: -1 }}
      whileTap={{ scale: 0.992 }}
      className="group relative mt-8 flex h-[58px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white text-black font-medium transition-all duration-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.03))]" />
      <div className="absolute -bottom-5 left-1/2 h-10 w-3/4 -translate-x-1/2 bg-white/35 blur-2xl transition-all duration-500 group-hover:bg-white/50 group-hover:h-12 pointer-events-none" />

      <motion.div
        className="absolute inset-0 z-0 pointer-events-none"
        initial={{ x: '-120%' }}
        whileHover={{ x: '120%' }}
        transition={{ duration: 0.9, ease: 'easeInOut' }}
        style={{
          background:
            'linear-gradient(115deg, transparent 25%, rgba(255,255,255,0.92) 45%, rgba(190,190,190,0.72) 50%, transparent 60%)',
          mixBlendMode: 'difference',
        }}
      />

      <span className="relative z-10 flex items-center gap-2 tracking-[0.18em] uppercase text-[13px]">
        {loading ? <Loader2 size={18} className="animate-spin text-black" /> : children}
      </span>
    </motion.button>
  );
}

function ElegantBackground() {
 
  const svgLines = [
    // 偏上方流动，平缓经过
    { d: 'M -200 350 C 400 450, 900 200, 1600 300', delay: 0 },
    // 从中下起始，向右上角飞升
    { d: 'M -100 600 C 300 700, 800 400, 1500 250', delay: 5 },
    // 原本穿过右下角的线：现在在屏幕中段就提前向上方收起，完美绕过光环
    //{ d: 'M -150 800 C 500 750, 900 450, 1600 450', delay: 0.8 },
    // 走一个灵动的S型，中间微沉，但在进入右侧时迅速抬高
    { d: 'M -300 500 C 300 300, 1000 550, 1700 350', delay: 10 },
  ];

  const nodes = Array.from({ length: 45 }, (_, i) => ({
    id: `node-${i}`,
    size: 1.5 + (i % 3) * 1.5,
    left: `${4 + ((i * 47) % 92)}%`,
    top: `${6 + ((i * 29) % 88)}%`,
    duration: 5 + (i % 5) * 2.5,
    delay: (i % 7) * 0.6,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 1. 基底与深层光晕 */}
      <div className="absolute inset-0 bg-black" />
      <motion.div
        className="absolute left-1/2 top-1/2 h-[74rem] w-[74rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.032) 24%, rgba(255,255,255,0.012) 42%, transparent 68%)',
          filter: 'blur(22px)',
        }}
        animate={{ scale: [1, 1.035, 1], opacity: [0.72, 0.96, 0.72] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 2. 原有的几何光环体系 */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 0 40px rgba(255,255,255,0.08), inset 0 0 24px rgba(255,255,255,0.025)',
        }}
        animate={{ rotate: 360, scale: [1, 1.008, 1] }}
        transition={{
          rotate: { duration: 42, repeat: Infinity, ease: 'linear' },
          scale: { duration: 9, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-[54rem] w-[54rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 0 60px rgba(255,255,255,0.04)' }}
        animate={{ rotate: -360 }}
        transition={{ duration: 72, repeat: Infinity, ease: 'linear' }}
      />
      <motion.div
        className="absolute left-[10%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-white/[0.035] blur-[120px]"
        animate={{ opacity: [0.08, 0.16, 0.08], scale: [1, 1.06, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      
      {/* 3. 很淡的网格与暗角 */}
      <div className="absolute inset-0 opacity-[0.018] [background-image:linear-gradient(rgba(255,255,255,1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,1)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_18%,rgba(0,0,0,0.88)_48%,transparent_78%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_26%,rgba(0,0,0,0.34)_62%,rgba(0,0,0,0.8)_100%)]" />

      {/* 🌟 4. 新的 SVG 流动线条动画 */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.65]" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineGlow" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="rgba(255,255,255,0)" />
            {/* 核心修改 2：降低流动高光的刺眼感，让它更像柔和的拖尾 */}
            <stop offset="0.5" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        {svgLines.map((line, index) => (
          <g key={index}>
            {/* 核心修改 3：基础轨道线变得极淡，只在光效流过时显现 */}
            <path d={line.d} stroke="rgba(255,255,255,0.015)" strokeWidth="0.5" />
            <motion.path
              d={line.d}
              stroke="url(#lineGlow)"
              strokeWidth="1.5"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
            
              animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
              transition={{
                duration: 7, // 稍微放慢速度，增加优雅感
                delay: line.delay,
                repeat: Infinity,
                repeatDelay: 1.5,
                ease: 'easeInOut',
              }}
            />
          </g>
        ))}
      </svg>

      {/* 5. 灰白系粒子动画 */}
      <div className="pointer-events-none absolute inset-0">
        {nodes.map((node) => (
          <motion.div
            key={node.id}
            className="absolute rounded-full bg-white/30 shadow-[0_0_12px_rgba(255,255,255,0.15)]"
            style={{
              left: node.left,
              top: node.top,
              width: node.size,
              height: node.size,
            }}
            animate={{
              y: [0, -25, 0],
              opacity: [0.1, 0.7, 0.1],
              scale: [1, 1.4, 1],
            }}
            transition={{
              duration: node.duration,
              delay: node.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await authService.login(username, password);
      localStorage.setItem('tapnow_token', data.accessToken);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || '登录凭证无效');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#000000] text-white selection:bg-white/20">
      <ElegantBackground />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.985, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[460px]"
        >
          <div className="relative overflow-hidden rounded-[2.4rem] border border-white/[0.06] bg-[rgba(8,8,8,0.44)] p-12 shadow-[0_40px_120px_rgba(0,0,0,0.86),0_8px_30px_rgba(255,255,255,0.03),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-[28px]">
            {/* 外轮廓与高光 */}
            <div className="absolute inset-0 rounded-[2.4rem] ring-1 ring-white/[0.04]" />
            <div className="absolute left-6 right-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <div className="absolute -inset-px rounded-[2.4rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent_22%,transparent_72%,rgba(255,255,255,0.05))] opacity-70 pointer-events-none" />

            {/* 卡片内部反光，拉开与背景关系 */}
            <div className="pointer-events-none absolute left-1/2 top-[-18%] h-40 w-[120%] -translate-x-1/2 rounded-full bg-white/[0.04] blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-18%] left-1/2 h-36 w-[92%] -translate-x-1/2 rounded-full bg-white/[0.025] blur-3xl" />
            <div className="relative mb-12 flex flex-col items-center justify-center">
              <motion.div
                className="mb-8 flex h-20 w-20 items-center justify-center rounded-[1.3rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_18px_35px_rgba(0,0,0,0.48)] backdrop-blur-xl"
                whileHover={{ rotate: 180, scale: 1.05 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              >
                <FolderKanban size={32} strokeWidth={1.15} className="text-white/90" />
              </motion.div>

              <h1 className="text-[2rem] font-light uppercase tracking-[0.32em] text-white">
                无限画布
              </h1>
              <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-white/34">
                登录开启你的无限创意之旅
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative mb-6 rounded-2xl border border-red-500/10 bg-red-500/6 px-4 py-3 text-center text-sm text-red-400 backdrop-blur-md"
              >
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="group relative">
                <div className="absolute -inset-[1px] rounded-2xl bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)] opacity-0 blur-sm transition-opacity duration-500 group-focus-within:opacity-100" />

                <div className="relative flex h-[58px] items-center rounded-2xl border border-white/[0.06] bg-white/[0.035] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-500 group-focus-within:border-white/14 group-focus-within:bg-white/[0.05]">
                  <User
                    size={18}
                    strokeWidth={1.5}
                    className="mr-4 text-white/25 transition-colors duration-300 group-focus-within:text-white/80"
                  />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="用户名"
                    className="h-full w-full bg-transparent text-[15px] tracking-[0.08em] text-white placeholder:text-white/22 outline-none"
                  />
                </div>
              </div>

              <div className="group relative">
                <div className="absolute -inset-[1px] rounded-2xl bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.24),transparent)] opacity-0 blur-sm transition-opacity duration-500 group-focus-within:opacity-100" />

                <div className="relative flex h-[58px] items-center rounded-2xl border border-white/[0.06] bg-white/[0.035] px-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-500 group-focus-within:border-white/14 group-focus-within:bg-white/[0.05]">
                  <Lock
                    size={18}
                    strokeWidth={1.5}
                    className="mr-4 text-white/25 transition-colors duration-300 group-focus-within:text-white/80"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="密码"
                    className="h-full w-full bg-transparent text-[15px] tracking-[0.08em] text-white placeholder:text-white/22 outline-none"
                    style={{ WebkitTextSecurity: 'disc' }}
                  />
                </div>
              </div>

              <PremiumGlowButton loading={loading} type="submit">
                登录
                <ArrowRight size={16} strokeWidth={2} />
              </PremiumGlowButton>
            </form>

            <div className="relative z-10 mt-8 text-center">
              <button
                type="button"
                onClick={() => window.alert('请联系管理员')}
                className="text-[12px] uppercase tracking-[0.18em] text-white/22 transition hover:text-white/62 hover:underline underline-offset-4"
              >
                忘记密码？
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}