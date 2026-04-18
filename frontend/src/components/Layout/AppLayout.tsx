import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useScanStore } from '../../store/scanStore';

export default function AppLayout() {
  const loadScans = useScanStore((s) => s.loadScans);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-6 py-8 sm:px-8 sm:py-10" style={{ background: 'var(--bg-primary)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
