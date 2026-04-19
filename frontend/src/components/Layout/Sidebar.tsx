import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import horizonLogo from '../../assets/horizon-logo.png';
import {
  LayoutDashboard,
  Shield,
  Gauge,
  Code,
  Settings,
  FileText,
  Trophy,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Globe,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { useScanStore } from '../../store/scanStore';

const navItems = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/security', label: 'Security', icon: Shield },
  { to: '/performance', label: 'Performance', icon: Gauge },
  { to: '/code-quality', label: 'Code Quality', icon: Code },
  { to: '/control-center', label: 'Control Center', icon: Settings },
  { to: '/reporting', label: 'Reporting', icon: FileText },
  { to: '/competition', label: 'Competition', icon: Trophy },
  { to: '/chat', label: 'AI Chat', icon: MessageSquare },
];

function getStatusColor(status: string | undefined) {
  switch (status) {
    case 'completed': return 'bg-emerald-400';
    case 'running':
    case 'pending': return 'bg-amber-400 animate-pulse';
    case 'failed': return 'bg-red-400';
    default: return 'bg-zinc-500';
  }
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const currentScan = useScanStore((s) => s.currentScan);

  return (
    <motion.aside
      animate={{ width: collapsed ? 80 : 288 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col h-screen overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(17,21,37,0.98) 0%, rgba(6,8,15,0.99) 100%)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Subtle gradient accent at top */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: 'var(--gradient-primary)' }}
      />

      {/* Logo */}
      <div className={`flex items-center gap-3.5 px-5 pt-8 pb-6 ${collapsed ? 'justify-center px-3' : ''}`}>
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-xl blur-lg opacity-50" style={{ background: 'var(--gradient-primary)' }} />
          <div
            className="relative flex items-center justify-center w-11 h-11 rounded-xl overflow-hidden border border-white/10 bg-[rgba(6,8,15,0.85)]"
            style={{ background: 'linear-gradient(145deg, rgba(17,21,37,0.9) 0%, rgba(12,14,24,0.95) 100%)' }}
          >
            <img
              src={horizonLogo}
              alt=""
              className="w-9 h-9 object-contain select-none"
              width={36}
              height={36}
              draggable={false}
            />
          </div>
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap min-w-0"
            >
              <div className="text-[15px] font-bold tracking-tight leading-tight gradient-text">
                Horizon Agent
              </div>
              <div className="mt-1 text-[11px] font-medium tracking-[0.12em] text-zinc-400 uppercase">
                OTT Monitor
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Current Target */}
      <AnimatePresence>
        {!collapsed && currentScan && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-2 px-4 py-4 rounded-xl"
            style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.18)',
            }}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">
              <Globe size={14} className="text-indigo-400/90 shrink-0" strokeWidth={2} />
              Active scan
            </div>
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ring-2 ring-white/10 ${getStatusColor(currentScan.status)}`} />
              <p
                className="text-[13px] leading-snug text-zinc-100 font-medium break-all"
                title={currentScan.target_url}
              >
                {currentScan.target_url}
              </p>
            </div>
            <p className="mt-3 text-[11px] text-zinc-500 capitalize">
              {currentScan.status === 'completed' ? 'Finished' : currentScan.status === 'failed' ? 'Failed' : 'In progress'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {!collapsed && currentScan && (
        <div className="mx-5 mb-4 h-px bg-[var(--border)] opacity-80" aria-hidden />
      )}

      {!collapsed && (
        <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Workspace
        </p>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-4 pb-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative flex items-center gap-3.5 min-h-[44px] px-4 py-3 rounded-xl text-[14px] font-medium transition-all duration-200 group ${
                isActive
                  ? 'text-white'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-bg"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.1) 100%)',
                      border: '1px solid rgba(99,102,241,0.15)',
                    }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                    style={{ background: 'var(--gradient-primary)' }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <item.icon
                  size={20}
                  className={`relative z-10 shrink-0 transition-colors ${
                    isActive ? 'text-indigo-300' : 'text-zinc-500 group-hover:text-zinc-300'
                  }`}
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className="relative z-10 whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-4 pt-2 space-y-3 border-t border-[var(--border)] mt-auto">
        {/* AI powered badge */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 px-4 py-3.5 rounded-xl text-xs leading-relaxed text-zinc-400"
              style={{
                background: 'rgba(139, 92, 246, 0.06)',
                border: '1px solid rgba(139, 92, 246, 0.12)',
              }}
            >
              <Sparkles size={16} className="text-violet-400 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold text-zinc-300">Analysis engine</span>
                <span className="block mt-1 text-[11px] text-zinc-500">Security, performance and code agents</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full min-h-[44px] py-2 rounded-xl text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-all text-sm font-medium"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="ml-2 text-xs font-medium"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
