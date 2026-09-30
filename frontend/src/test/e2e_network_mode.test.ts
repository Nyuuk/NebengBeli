import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isLocalOrDevEnvironment,
  isSimulatedOffline,
  setSimulatedOffline,
  isAppOnline,
  initOfflineNetworkSeam,
  isLoopbackHost,
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
    initOfflineNetworkSeam();
    const e2eHelper = (window as unknown as {
      __NEBENGBELI_E2E__?: {
        setOffline: (v: boolean) => void;
        isOffline: () => boolean;
        isSimulatedOffline: () => boolean;
        syncNow: () => Promise<unknown>;
        getPendingCount: () => Promise<number>;
        resetOfflineState: () => void;
      };
    }).__NEBENGBELI_E2E__;

    expect(e2eHelper).toBeDefined();
    expect(typeof e2eHelper?.setOffline).toBe('function');
    expect(typeof e2eHelper?.isOffline).toBe('function');
    expect(typeof e2eHelper?.isSimulatedOffline).toBe('function');
    expect(typeof e2eHelper?.syncNow).toBe('function');
    expect(typeof e2eHelper?.getPendingCount).toBe('function');
    expect(typeof e2eHelper?.resetOfflineState).toBe('function');

    e2eHelper?.setOffline(true);
    expect(e2eHelper?.isOffline()).toBe(true);
    expect(e2eHelper?.isSimulatedOffline()).toBe(true);

    e2eHelper?.resetOfflineState();
    expect(e2eHelper?.isOffline()).toBe(false);
    expect(e2eHelper?.isSimulatedOffline()).toBe(false);
  });

  it('correctly matches loopback hostnames with isLoopbackHost', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('  LOCALHOST  ')).toBe(true);

    expect(isLoopbackHost('nebengbeli.nyuuk.my.id')).toBe(false);
    expect(isLoopbackHost('staging.nebengbeli.internal')).toBe(false);
    expect(isLoopbackHost('192.168.1.100')).toBe(false);
    expect(isLoopbackHost('10.0.0.1')).toBe(false);
    expect(isLoopbackHost('172.17.0.1')).toBe(false);
    expect(isLoopbackHost('app.local')).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
  });

  it('strictly restricts active seam to loopback localhost only and stays inert on non-localhost', () => {
    const originalLocation = window.location;
    (window as unknown as { __TEST_FORCE_PROD__?: boolean }).__TEST_FORCE_PROD__ = true;

    try {
      // Test loopback addresses
      const loopbackHosts = ['localhost', '127.0.0.1', '::1', '[::1]'];
      for (const host of loopbackHosts) {
        Object.defineProperty(window, 'location', {
          value: { hostname: host },
          writable: true,
        });
        expect(isLocalOrDevEnvironment()).toBe(true);
        initOfflineNetworkSeam();
        expect((window as unknown as { __NEBENGBELI_E2E__?: unknown }).__NEBENGBELI_E2E__).toBeDefined();
      }

      // Test non-localhost / production / LAN addresses
      const nonLocalHosts = [
        'nebengbeli.nyuuk.my.id',
        'staging.nebengbeli.internal',
        '192.168.1.100',
        '10.0.0.1',
        '172.17.0.1',
        'app.local',
      ];

      for (const host of nonLocalHosts) {
        Object.defineProperty(window, 'location', {
          value: { hostname: host },
          writable: true,
        });

        expect(isLocalOrDevEnvironment()).toBe(false);

        initOfflineNetworkSeam();
        expect((window as unknown as { __NEBENGBELI_E2E__?: unknown }).__NEBENGBELI_E2E__).toBeUndefined();

        // Attempting to set simulated offline should be inert
        setSimulatedOffline(true);
        expect(isSimulatedOffline()).toBe(false);
        expect(isAppOnline()).toBe(true);
      }
    } finally {
      delete (window as unknown as { __TEST_FORCE_PROD__?: boolean }).__TEST_FORCE_PROD__;
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      });
      initOfflineNetworkSeam();
    }
  });
});
