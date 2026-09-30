import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isLocalOrDevEnvironment,
  isSimulatedOffline,
  setSimulatedOffline,
  isAppOnline,
} from '../offline/networkMode';
import { request, ApiError } from '../api/client';

describe('Local-Only E2E Offline Network-Mode Control Seam', () => {
  beforeEach(() => {
    setSimulatedOffline(false);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    setSimulatedOffline(false);
  });

  it('detects local/dev environment correctly', () => {
    expect(isLocalOrDevEnvironment()).toBe(true);
  });

  it('toggles simulated offline state and updates isAppOnline', () => {
    expect(isSimulatedOffline()).toBe(false);
    expect(isAppOnline()).toBe(true);

    setSimulatedOffline(true);
    expect(isSimulatedOffline()).toBe(true);
    expect(isAppOnline()).toBe(false);

    setSimulatedOffline(false);
    expect(isSimulatedOffline()).toBe(false);
    expect(isAppOnline()).toBe(true);
  });

  it('dispatches custom and standard window events on network mode changes', () => {
    const customListener = vi.fn();
    const offlineListener = vi.fn();
    const onlineListener = vi.fn();

    window.addEventListener('nebengbeli:network-mode-change', customListener);
    window.addEventListener('offline', offlineListener);
    window.addEventListener('online', onlineListener);

    setSimulatedOffline(true);
    expect(customListener).toHaveBeenCalledTimes(1);
    expect(offlineListener).toHaveBeenCalledTimes(1);

    setSimulatedOffline(false);
    expect(customListener).toHaveBeenCalledTimes(2);
    expect(onlineListener).toHaveBeenCalledTimes(1);

    window.removeEventListener('nebengbeli:network-mode-change', customListener);
    window.removeEventListener('offline', offlineListener);
    window.removeEventListener('online', onlineListener);
  });

  it('causes client request() to fail immediately without fetch when simulated offline', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setSimulatedOffline(true);

    await expect(request('/api/wallets')).rejects.toThrow(ApiError);
    await expect(request('/api/wallets')).rejects.toThrow(/You are currently offline/);

    // Fetch should not have been invoked
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exposes window.__NEBENGBELI_E2E__ helper on window for browser automation', () => {
    const e2eHelper = (window as unknown as {
      __NEBENGBELI_E2E__?: {
        setOffline: (v: boolean) => void;
        isOffline: () => boolean;
        syncNow: () => Promise<unknown>;
        getPendingCount: () => Promise<number>;
        resetOfflineState: () => void;
      };
    }).__NEBENGBELI_E2E__;

    expect(e2eHelper).toBeDefined();
    expect(typeof e2eHelper?.setOffline).toBe('function');
    expect(typeof e2eHelper?.isOffline).toBe('function');
    expect(typeof e2eHelper?.syncNow).toBe('function');
    expect(typeof e2eHelper?.getPendingCount).toBe('function');
    expect(typeof e2eHelper?.resetOfflineState).toBe('function');

    e2eHelper?.setOffline(true);
    expect(e2eHelper?.isOffline()).toBe(true);

    e2eHelper?.resetOfflineState();
    expect(e2eHelper?.isOffline()).toBe(false);
  });
});
