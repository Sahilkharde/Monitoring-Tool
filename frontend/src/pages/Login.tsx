import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Loader2, AlertCircle, Eye, EyeOff, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api } from '../utils/api';

export default function Login() {
  const { login, signup, isAuthenticated } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    api.get<{ open: boolean }>('/auth/registration-status')
      .then((d) => setRegistrationOpen(!!d.open))
      .catch(() => setRegistrationOpen(false));
  }, []);

  if (isAuthenticated) return <Navigate to="/overview" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signup(name, email, password);
      } else {
        await login(email, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen p-4 overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Animated background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ x: [0, 30, -20, 0], y: [0, -40, 20, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute top-[15%] left-[20%] w-[500px] h-[500px] rounded-full blur-[140px]"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }}
        />
        <motion.div
          animate={{ x: [0, -30, 20, 0], y: [0, 30, -20, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="absolute bottom-[10%] right-[15%] w-[600px] h-[600px] rounded-full blur-[160px]"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)' }}
        />
        <motion.div
          animate={{ x: [0, 20, -15, 0], y: [0, -25, 15, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
          className="absolute top-[50%] left-[60%] w-[400px] h-[400px] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)' }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[440px] z-10"
      >
        {/* Glow behind card */}
        <div className="absolute -inset-4 rounded-3xl blur-2xl opacity-40" style={{ background: 'var(--gradient-primary)' }} />

        {/* Main card */}
        <div
          className="relative rounded-2xl border p-10 backdrop-blur-xl"
          style={{
            background: 'linear-gradient(145deg, rgba(17,21,37,0.95) 0%, rgba(12,14,24,0.98) 100%)',
            borderColor: 'rgba(99,102,241,0.15)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.03)',
          }}
        >
          {/* Brand */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
            className="flex flex-col items-center mb-10"
          >
            <img
              src={`${import.meta.env.BASE_URL}horizon-logo.png`}
              alt="Horizon"
              className="mb-5 w-auto max-w-[min(100%,240px)] max-h-28 object-contain object-center select-none"
              width={240}
              height={120}
              draggable={false}
            />
            <h1 className="text-2xl font-bold gradient-text tracking-tight text-center">
              Horizon Verification Agent
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-2 tracking-wide">
              OTT Platform Security & Performance Monitor
            </p>
          </motion.div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="mb-6 space-y-2 rounded-xl px-4 py-3.5 text-sm"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 text-red-400 mt-0.5" />
                <span className="text-red-300 leading-relaxed">{error}</span>
              </div>
              {(/404|Not Found|not reaching FastAPI/i.test(error)) && (
                <p className="text-xs text-red-200/90 pl-8 leading-relaxed border-t border-red-500/20 pt-2">
                  Seeded login:{' '}
                  <strong className="font-mono text-red-100">amudha.kaliamoorthi@horizonind.org</strong> /{' '}
                  <strong className="font-mono text-red-100">Admin@2026</strong> — only works when the API answers.
                  <br />
                  <span className="text-red-200/80">
                    Start the backend (<code className="text-red-100">uvicorn … --port PORT</code>), then set{' '}
                    <code className="text-red-100">VITE_API_PROXY=http://127.0.0.1:PORT</code> in{' '}
                    <code className="text-red-100">frontend/.env.development</code> to the same PORT and restart{' '}
                    <code className="text-red-100">npm run dev</code>.
                  </span>
                </p>
              )}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'signup' && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
              >
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                  Display name
                </label>
                <div className="relative group">
                  <User
                    size={16}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors pointer-events-none"
                  />
                  <input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required={mode === 'signup'}
                    className="w-full py-3.5 rounded-xl text-sm"
                    style={{ paddingLeft: '3rem' }}
                    autoComplete="name"
                  />
                </div>
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                Email
              </label>
              <div className="relative group">
                <Mail
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors pointer-events-none"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full py-3.5 rounded-xl text-sm"
                  style={{ paddingLeft: '3rem' }}
                  autoComplete="email"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                Password
              </label>
              <div className="relative group">
                <Lock
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors pointer-events-none"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pr-12 py-3.5 rounded-xl text-sm"
                  style={{ paddingLeft: '3rem' }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2.5 py-3.5 text-sm font-semibold rounded-xl mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {mode === 'signup' ? 'Creating account...' : 'Authenticating...'}
                  </>
                ) : mode === 'signup' ? (
                  'Create account'
                ) : (
                  'Sign in to Dashboard'
                )}
              </button>
            </motion.div>
            {registrationOpen && (
              <p className="text-center text-xs text-[var(--text-tertiary)] pt-2">
                {mode === 'login' ? (
                  <>
                    New here?{' '}
                    <button
                      type="button"
                      className="text-[var(--accent)] hover:underline font-medium"
                      onClick={() => { setMode('signup'); setError(''); }}
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="text-[var(--accent)] hover:underline font-medium"
                      onClick={() => { setMode('login'); setError(''); }}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            )}
          </form>
        </div>
      </motion.div>
    </div>
  );
}
