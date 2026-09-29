import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '../types';
import { getMeApi, loginApi, logoutApi, registerApi, renewAuthTokenApi } from '../api/auth';
import { getPendingOfflineCount } from '../offline/db';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  renewSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const lastRenewRef = useRef<number>(0);

  const refreshUser = useCallback(async () => {
    try {
      const res = await getMeApi();
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const renewSession = useCallback(async () => {
    // Throttle renewals to at most once every 10 minutes
    const now = Date.now();
    if (now - lastRenewRef.current < 10 * 60 * 1000) {
      return;
    }
    lastRenewRef.current = now;

    try {
      const res = await renewAuthTokenApi();
      if (res?.user) {
        setUser(res.user);
      }
    } catch (err) {
      // If renew fails due to token version revocation, refresh current user status
      console.warn('Session renew check failed:', err);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Set up periodic token renewal (every 30 minutes) & on visibility/focus change
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      renewSession();
    }, 30 * 60 * 1000);

    const handleFocus = () => {
      renewSession();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        renewSession();
      }
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, renewSession]);

  const login = async (username: string, password: string) => {
    const res = await loginApi(username, password);
    setUser(res.user);
    lastRenewRef.current = Date.now();
  };

  const register = async (username: string, password: string) => {
    const res = await registerApi(username, password);
    setUser(res.user);
    lastRenewRef.current = Date.now();
  };

  const logout = async () => {
    try {
      const pendingCount = await getPendingOfflineCount();
      if (pendingCount > 0) {
        const proceed = window.confirm(
          `Peringatan: Terdapat ${pendingCount} antrean transaksi offline yang belum tersinkronisasi. Transaksi tersebut akan tetap tersimpan di perangkat sampai Anda login kembali dengan akun ini. Apakah Anda yakin ingin keluar?`
        );
        if (!proceed) {
          return;
        }
      }
      await logoutApi();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        renewSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
