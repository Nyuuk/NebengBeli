import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '../types';
import { getMeApi, loginApi, logoutApi, registerApi, renewAuthTokenApi, updateUsernameApi } from '../api/auth';
import {
  getPendingOfflineCount,
  hasShoppingDraft,
  setCurrentUserId,
  setCachedUser,
  getCachedUser,
  clearCachedUser,
} from '../offline/db';
import { isAppOnline } from '../offline/networkMode';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  updateUsername: (newUsername: string) => Promise<void>;
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
      if (!isAppOnline()) {
        const cached = await getCachedUser();
        if (cached) {
          setUser(cached);
          setCurrentUserId(cached.id);
          console.warn('[AuthContext] Running in offline session mode with cached user:', cached.username);
        } else {
          setUser(null);
          setCurrentUserId(null);
        }
        return;
      }

      const res = await getMeApi();
      if (res?.user) {
        setUser(res.user);
        setCurrentUserId(res.user.id);
        await setCachedUser(res.user);
      } else {
        await clearCachedUser();
        setUser(null);
        setCurrentUserId(null);
      }
    } catch (err: unknown) {
      const errorStatus = (err && typeof err === 'object' && 'status' in err)
        ? (err as { status: number }).status
        : undefined;

      if (errorStatus === 401) {
        // Explicit 401 Unauthorized: token expired or invalidated by server
        await clearCachedUser();
        setUser(null);
        setCurrentUserId(null);
      } else if (!isAppOnline() || errorStatus === 0 || (typeof errorStatus === 'number' && errorStatus >= 500) || errorStatus === undefined) {
        // Network error / server offline: fallback to cached user session
        const cached = await getCachedUser();
        if (cached) {
          setUser(cached);
          setCurrentUserId(cached.id);
          console.warn('[AuthContext] Running in offline session mode with cached user:', cached.username);
        } else {
          setUser(null);
          setCurrentUserId(null);
        }
      } else {
        // Other unexpected failures
        await clearCachedUser();
        setUser(null);
        setCurrentUserId(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const renewSession = useCallback(async () => {
    if (!isAppOnline()) {
      return;
    }

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
        await setCachedUser(res.user);
      }
    } catch (err: unknown) {
      const errorStatus = (err && typeof err === 'object' && 'status' in err)
        ? (err as { status: number }).status
        : undefined;

      console.warn('Session renew check failed:', err);
      if (errorStatus === 401) {
        await clearCachedUser();
        setUser(null);
        setCurrentUserId(null);
      }
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

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        renewSession();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, renewSession]);

  const login = async (username: string, password: string) => {
    const res = await loginApi(username, password);
    setUser(res.user);
    setCurrentUserId(res.user.id);
    await setCachedUser(res.user);
    lastRenewRef.current = Date.now();
  };

  const register = async (username: string, password: string) => {
    const res = await registerApi(username, password);
    setUser(res.user);
    setCurrentUserId(res.user.id);
    await setCachedUser(res.user);
    lastRenewRef.current = Date.now();
  };

  const updateUsername = async (newUsername: string) => {
    const res = await updateUsernameApi(newUsername);
    setUser(res.user);
    setCurrentUserId(res.user.id);
    await setCachedUser(res.user);
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

      try {
        await logoutApi();
      } catch (err) {
        console.error('Logout error:', err);
      }
      await clearCachedUser();
      setUser(null);
      setCurrentUserId(null);
      return true;
    } catch (err) {
      console.error('Logout error:', err);
      await clearCachedUser();
      setUser(null);
      setCurrentUserId(null);
      return true;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        updateUsername,
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
