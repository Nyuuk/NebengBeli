import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getPendingOfflineCount } from '../offline/db';
import { syncOfflineQueue } from '../offline/sync';

interface OnlineStatusContextType {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const OnlineStatusContext = createContext<OnlineStatusContextType | undefined>(undefined);

export const OnlineStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingOfflineCount();
      setPendingCount(count);
    } catch (err) {
      console.error('Failed to read pending count from IndexedDB:', err);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    try {
      setIsSyncing(true);
      await syncOfflineQueue();
      await refreshPendingCount();
    } catch (err) {
      console.error('Offline sync encountered error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    refreshPendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPendingCount, triggerSync]);

  return (
    <OnlineStatusContext.Provider
      value={{
        isOnline,
        pendingCount,
        isSyncing,
        triggerSync,
        refreshPendingCount,
      }}
    >
      {children}
    </OnlineStatusContext.Provider>
  );
};

export const useOnlineStatus = (): OnlineStatusContextType => {
  const context = useContext(OnlineStatusContext);
  if (!context) {
    throw new Error('useOnlineStatus must be used within an OnlineStatusProvider');
  }
  return context;
};
