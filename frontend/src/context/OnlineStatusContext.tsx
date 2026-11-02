import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getPendingOfflineCount } from '../offline/db';
import { syncOfflineQueue } from '../offline/sync';
import { isAppOnline, isSimulatedOffline, setSimulatedOffline } from '../offline/networkMode';

interface OnlineStatusContextType {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  setSimulatedOffline: (offline: boolean) => void;
  pendingCount: number;
  isSyncing: boolean;
  triggerSync: (options?: { force?: boolean }) => Promise<void>;
  refreshPendingCount: () => Promise<void>;
}

const OnlineStatusContext = createContext<OnlineStatusContextType | undefined>(undefined);

export const OnlineStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(isAppOnline());
  const [simOffline, setSimOffline] = useState<boolean>(isSimulatedOffline());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const isMountedRef = useRef(true);
  const isSyncingRef = useRef(false);

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

  const triggerSync = useCallback(
    async (options?: { force?: boolean }) => {
      if (!isAppOnline() || isSyncingRef.current) return;

      try {
        isSyncingRef.current = true;
        if (isMountedRef.current) {
          setIsSyncing(true);
        }
        await syncOfflineQueue(undefined, undefined, options?.force);
        await refreshPendingCount();
      } catch (err) {
        console.error('Offline sync encountered error:', err);
      } finally {
        isSyncingRef.current = false;
        if (isMountedRef.current) {
          setIsSyncing(false);
        }
      }
    },
    [refreshPendingCount]
  );

  const triggerSyncRef = useRef(triggerSync);
  triggerSyncRef.current = triggerSync;

  useEffect(() => {
    const updateStatus = () => {
      if (!isMountedRef.current) return;
      const online = isAppOnline();
      setIsOnline(online);
      setSimOffline(isSimulatedOffline());
      if (online) {
        triggerSyncRef.current();
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
          triggerSyncRef.current();
        }
      } else {
        updateStatus();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('nebengbeli:network-mode-change', handleNetworkModeChange);

    // Initial check on mount
    refreshPendingCount();
    updateStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('nebengbeli:network-mode-change', handleNetworkModeChange);
    };
  }, [refreshPendingCount]);

  const handleSetSimulatedOffline = useCallback((offline: boolean) => {
    setSimulatedOffline(offline);
    setSimOffline(offline);
    const online = !offline && navigator.onLine;
    setIsOnline(online);
    if (online) {
      triggerSyncRef.current();
    }
  }, []);

  const contextValue = useMemo<OnlineStatusContextType>(
    () => ({
      isOnline,
      isSimulatedOffline: simOffline,
      setSimulatedOffline: handleSetSimulatedOffline,
      pendingCount,
      isSyncing,
      triggerSync,
      refreshPendingCount,
    }),
    [isOnline, simOffline, handleSetSimulatedOffline, pendingCount, isSyncing, triggerSync, refreshPendingCount]
  );

  return (
    <OnlineStatusContext.Provider value={contextValue}>
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
