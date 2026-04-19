import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Activity,
  Loader2,
  LogOut,
  Server,
  Wifi,
  Clock,
  ListChecks,
  Globe,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  Menu,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useScanStore } from '../../store/scanStore';
import { useNotificationStore } from '../../store/notificationStore';
import type { Notification } from '../../store/notificationStore';
import { formatDistanceToNow } from 'date-fns';

function getStatusColor(status: string | undefined) {
  switch (status) {
    case 'completed': return 'bg-emerald-400';
    case 'running':
    case 'pending': return 'bg-amber-400 animate-pulse';
    case 'failed': return 'bg-red-400';
    default: return 'bg-zinc-500';
  }
}

function getNotificationIcon(type: Notification['type']) {
  switch (type) {
    case 'scan_complete': return <CheckCircle2 size={16} className="text-emerald-400" />;
    case 'scan_started': return <Info size={16} className="text-indigo-400" />;
    case 'scan_failed': return <XCircle size={16} className="text-red-400" />;
    case 'info': return <Info size={16} className="text-zinc-400" />;
  }
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

export default function TopBar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const currentScan = useScanStore((s) => s.currentScan);
  const scans = useScanStore((s) => s.scans);
  const scanning = useScanStore((s) => s.scanning);
  const { notifications, unreadCount, markAllRead, clearAll } = useNotificationStore();

  const [showHealth, setShowHealth] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const healthRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useClickOutside(healthRef, () => setShowHealth(false));
  useClickOutside(notifRef, () => setShowNotifications(false));
  useClickOutside(userRef, () => setShowUser(false));

  const lastScanTime = currentScan?.completed_at
    ? formatDistanceToNow(new Date(currentScan.completed_at), { addSuffix: true })
    : null;

  const lastRecorded = scans[0];
  const lastRecordedTime = lastRecorded?.completed_at
    ? formatDistanceToNow(new Date(lastRecorded.completed_at), { addSuffix: true })
    : lastRecorded?.started_at
      ? formatDistanceToNow(new Date(lastRecorded.started_at), { addSuffix: true })
      : null;

  const roleColor: Record<string, string> = {
    admin: 'text-indigo-400 bg-indigo-400/10',
    devops: 'text-emerald-400 bg-emerald-400/10',
    developer: 'text-cyan-400 bg-cyan-400/10',
    executive: 'text-violet-400 bg-violet-400/10',
  };

  return (
    <header
      className="flex items-center justify-between h-[60px] px-6 shrink-0"
      style={{
        background: 'linear-gradient(180deg, rgba(17,21,37,0.95) 0%, rgba(17,21,37,0.85) 100%)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {onOpenMobileNav && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="md:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu size={20} strokeWidth={2} />
          </button>
        )}
        {currentScan ? (
          <>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Globe size={15} className="text-[var(--text-tertiary)] shrink-0" />
              <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(currentScan.status)}`} />
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                {currentScan.target_url}
              </span>
            </div>
            {lastScanTime && (
              <span className="hidden sm:inline text-[11px] text-[var(--text-tertiary)] font-medium shrink-0">
                Last scan: {lastScanTime}
              </span>
            )}
          </>
        ) : lastRecorded ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe size={15} className="text-[var(--text-tertiary)] shrink-0" />
            <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(lastRecorded.status)}`} />
            <span className="text-sm text-[var(--text-secondary)] truncate max-w-[min(100vw-12rem,28rem)]">
              <span className="text-[var(--text-tertiary)] font-normal">Last verification: </span>
              <span className="font-medium text-[var(--text-primary)]">{lastRecorded.target_url}</span>
            </span>
            {lastRecordedTime && (
              <span className="hidden lg:inline text-[11px] text-[var(--text-tertiary)] font-medium shrink-0">
                {lastRecordedTime}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-[var(--text-tertiary)]">
            No verifications yet — run a scan in Control Center
          </span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Scan active badge */}
        {scanning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              color: 'var(--accent-hover)',
            }}
          >
            <Loader2 size={13} className="animate-spin" />
            Scanning
          </motion.div>
        )}

        {/* System Health */}
        <div ref={healthRef} className="relative">
          <button
            onClick={() => { setShowHealth(!showHealth); setShowNotifications(false); setShowUser(false); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all"
          >
            <div className="relative">
              <Activity size={15} />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <span className="hidden md:inline font-medium">Health</span>
          </button>
          <AnimatePresence>
            {showHealth && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-72 rounded-xl z-50 overflow-hidden"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-strong)',
                  boxShadow: 'var(--shadow-elevated)',
                }}
              >
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <h3 className="text-sm font-semibold">System Health</h3>
                </div>
                <div className="p-2.5 space-y-1.5">
                  <HealthRow icon={<Server size={14} />} label="API Server" status="Online" ok />
                  <HealthRow icon={<Wifi size={14} />} label="WebSocket" status="Connected" ok />
                  <HealthRow icon={<Clock size={14} />} label="Uptime" status="99.9%" ok />
                  <HealthRow icon={<ListChecks size={14} />} label="Scan Queue" status="0 pending" ok />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowHealth(false); setShowUser(false); }}
            className="relative flex items-center justify-center w-9 h-9 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white min-w-[16px] h-[16px] px-1"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </motion.span>
            )}
          </button>
          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-80 rounded-xl z-50 overflow-hidden"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-strong)',
                  boxShadow: 'var(--shadow-elevated)',
                }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  <div className="flex gap-2">
                    <button onClick={markAllRead} className="text-[11px] text-[var(--accent-hover)] hover:text-[var(--accent)] font-medium">
                      Mark read
                    </button>
                    <button onClick={clearAll} className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] font-medium">
                      Clear
                    </button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-[var(--text-tertiary)]">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`flex items-start gap-3 px-4 py-3 border-b transition-colors ${
                          !n.read ? 'bg-[var(--accent)]/[0.03]' : ''
                        }`}
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <div className="mt-0.5 shrink-0">{getNotificationIcon(n.type)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[var(--text-primary)]">{n.title}</div>
                          <div className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-2">{n.message}</div>
                          <div className="text-[10px] text-[var(--text-tertiary)] mt-1 font-medium">
                            {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                          </div>
                        </div>
                        {!n.read && <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--accent)' }} />}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Separator */}
        <div className="w-px h-7 mx-1" style={{ background: 'var(--border)' }} />

        {/* User */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => { setShowUser(!showUser); setShowHealth(false); setShowNotifications(false); }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.04] transition-all group"
          >
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-bold shrink-0"
              style={{ background: 'var(--gradient-primary)' }}
            >
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-[13px] font-semibold text-[var(--text-primary)] leading-tight">
                {user?.name || 'User'}
              </div>
              <div className={`text-[10px] font-medium capitalize leading-tight px-1.5 py-0.5 rounded-md inline-block mt-0.5 ${roleColor[user?.role || ''] || 'text-zinc-400 bg-zinc-400/10'}`}>
                {user?.role || 'user'}
              </div>
            </div>
            <ChevronDown size={14} className="text-[var(--text-tertiary)] hidden md:block" />
          </button>
          <AnimatePresence>
            {showUser && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-48 rounded-xl z-50 overflow-hidden p-1.5"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-strong)',
                  boxShadow: 'var(--shadow-elevated)',
                }}
              >
                <button
                  onClick={logout}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-400/10 transition-colors font-medium"
                >
                  <LogOut size={15} />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

function HealthRow({ icon, label, status, ok }: { icon: React.ReactNode; label: string; status: string; ok: boolean }) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--text-primary)]">{status}</span>
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: ok ? 'var(--success)' : 'var(--danger)',
            boxShadow: ok ? '0 0 6px var(--success-glow)' : '0 0 6px var(--danger-glow)',
          }}
        />
      </div>
    </div>
  );
}
