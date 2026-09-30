import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getPendingOfflineCount } from '../offline/db';
import { syncOfflineQueue } from '../offline/sync';
import { isAppOnline, isSimulatedOffline, setSimulatedOffline } from '../offline/networkMode';

interface OnlineStatusContextType {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  setSimulatedOffline: (offline: boolean) => void;
  pendingCount: number;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const OnlineStatusContext = createContext<OnlineStatusContextType | undefined>(undefined);

export const OnlineStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(isAppOnline());
  const [simOffline, setSimOffline] = useState<boolean>(isSimulatedOffline());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingOfflineCount();
      if (isMountedRef.current) {
        setPendingCount(count);
      }
    } catch (err) {
      console.error('Failed to read pending count from IndexedDB:', err);
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!isAppOnline() || isSyncing) return;

    try {
      if (isMountedRef.current) {
        setIsSyncing(true);
      }
      await syncOfflineQueue();
      await refreshPendingCount();
    } catch (err) {
      console.error('Offline sync encountered error:', err);
    } finally {
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    const updateStatus = () => {
      if (!isMountedRef.current) return;
      const online = isAppOnline();
      setIsOnline(online);
      setSimOffline(isSimulatedOffline());
      if (online) {
        triggerSync();
      }
    };

    const handleOnline = () => {
      updateStatus();
    };

    const handleOffline = () => {
      updateStatus();
    };

    const handleNetworkModeChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.isOffline === 'boolean') {
        const online = !detail.isOffline && navigator.onLine;
        setIsOnline(online);
        setSimOffline(detail.isOffline);
        if (online) {
          triggerSync();
        }
      } else {
        updateStatus();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('nebengbeli:network-mode-change', handleNetworkModeChange);

    // Initial check
    refreshPendingCount();
    updateStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('nebengbeli:network-mode-change', handleNetworkModeChange);
    };
  }, [refreshPendingCount, triggerSync]);

  const handleSetSimulatedOffline = useCallback((offline: boolean) => {
    setSimulatedOffline(offline);
    setSimOffline(offline);
    const online = !offline && navigator.onLine;
    setIsOnline(online);
    if (online) {
      triggerSync();
    }
  }, [triggerSync]);

  return (
    <OnlineStatusContext.Provider
      value={{
        isOnline,
        isSimulatedOffline: simOffline,
        setSimulatedOffline: handleSetSimulatedOffline,
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
