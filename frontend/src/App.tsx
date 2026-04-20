import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AppLayout from './components/Layout/AppLayout';
import { Loader2 } from 'lucide-react';

const Login = lazy(() => import('./pages/Login'));
const Overview = lazy(() => import('./pages/Overview'));
const Security = lazy(() => import('./pages/Security'));
const Performance = lazy(() => import('./pages/Performance'));
const CodeQuality = lazy(() => import('./pages/CodeQuality'));
const ControlCenter = lazy(() => import('./pages/ControlCenter'));
const Reporting = lazy(() => import('./pages/Reporting'));
const Competition = lazy(() => import('./pages/Competition'));
const Comparison = lazy(() => import('./pages/Comparison'));
const AIChat = lazy(() => import('./pages/AIChat'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <Loader2 size={32} className="animate-spin text-blue-500" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, loadUser } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) loadUser();
  }, [isAuthenticated, loadUser]);

  const routerBasename =
    (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || undefined;

  return (
    <BrowserRouter basename={routerBasename}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="overview" element={<Overview />} />
            <Route path="security" element={<Security />} />
            <Route path="performance" element={<Performance />} />
            <Route path="code-quality" element={<CodeQuality />} />
            <Route path="control-center" element={<ControlCenter />} />
            <Route path="reporting" element={<Reporting />} />
            <Route path="compare" element={<Comparison />} />
            <Route path="competition" element={<Competition />} />
            <Route path="chat" element={<AIChat />} />
          </Route>

          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
