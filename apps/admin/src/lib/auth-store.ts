'use client';
import { create } from 'zustand';

const STORAGE_KEY = 'finby_admin_token';

interface AuthState {
  token: string | null;
  setToken: (t: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY),
  setToken: (t) => {
    if (typeof window !== 'undefined') {
      if (t) window.localStorage.setItem(STORAGE_KEY, t);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
    set({ token: t });
  },
}));
