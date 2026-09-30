import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '../types';
import { getMeApi, loginApi, logoutApi, registerApi, renewAuthTokenApi } from '../api/auth';
import { getPendingOfflineCount, hasShoppingDraft, setCurrentUserId } from '../offline/db';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
  renewSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const lastRenewRef = useRef<number>(0);

  // Synchronize active user ID to offline DB
  useEffect(() => {
    setCurrentUserId(user?.id || null);
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await getMeApi();
      setUser(res.user);
      setCurrentUserId(res.user?.id || null);
    } catch {
      setUser(null);
      setCurrentUserId(null);
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
        setCurrentUserId(res.user.id);
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
    setCurrentUserId(res.user.id);
    lastRenewRef.current = Date.now();
  };

  const register = async (username: string, password: string) => {
    const res = await registerApi(username, password);
    setUser(res.user);
    setCurrentUserId(res.user.id);
    lastRenewRef.current = Date.now();
  };

  const logout = async (): Promise<boolean> => {
    try {
      const pendingCount = await getPendingOfflineCount(user?.id);
      const draftExists = await hasShoppingDraft(user?.id);

      if (pendingCount > 0 || draftExists) {
        const details: string[] = [];
        if (pendingCount > 0) {
          details.push(`${pendingCount} transaksi dalam antrean offline`);
        }
        if (draftExists) {
          details.push('draft sesi belanja yang belum disimpan');
        }

        const proceed = window.confirm(
          `Peringatan: Terdapat ${details.join(' dan ')} yang belum tersinkronisasi. Data tersebut akan tetap tersimpan aman di perangkat ini sampai Anda login kembali dengan akun yang sama. Apakah Anda yakin ingin keluar?`
        );
        if (!proceed) {
          return false;
        }
      }

      await logoutApi();
      return true;
    } catch (err) {
      console.error('Logout error:', err);
      return true;
    } finally {
      setUser(null);
      setCurrentUserId(null);
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
