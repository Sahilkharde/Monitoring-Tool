import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useScanStore } from '../../store/scanStore';

export default function AppLayout() {
  const loadScans = useScanStore((s) => s.loadScans);
  const scanning = useScanStore((s) => s.scanning);
  const currentScan = useScanStore((s) => s.currentScan);
  const pollScan = useScanStore((s) => s.pollScan);
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  /** Poll active scan(s) from any page (header quick-scan, Control Center, etc.). */
  useEffect(() => {
    if (!scanning || !currentScan) return;
    void pollScan();
    const t = setInterval(() => {
      void pollScan();
    }, 3000);
    return () => clearInterval(t);
  }, [scanning, currentScan?.scan_id, pollScan]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10"
          style={{ background: 'var(--bg-primary)' }}
        >
          <div className="mx-auto w-full max-w-[1600px] min-h-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
