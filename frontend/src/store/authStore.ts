import { create } from 'zustand';
import { api } from '../utils/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  login: async (email, password) => {
    const data = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password });
    localStorage.setItem('token', data.access_token);
    set({ user: data.user, token: data.access_token, isAuthenticated: true });
  },
  signup: async (name, email, password) => {
    const data = await api.post<{ access_token: string; user: User }>('/auth/signup', { name, email, password });
    localStorage.setItem('token', data.access_token);
    set({ user: data.user, token: data.access_token, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false });
  },
  loadUser: async () => {
    try {
      const user = await api.get<User>('/auth/me');
      set({ user, isAuthenticated: true });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
