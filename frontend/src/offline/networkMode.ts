/**
 * NebengBeli Local E2E Offline Network-Mode Control Seam
 *
 * Provides deterministic simulation of offline/online network states for automated E2E tests.
 * Fail-closed: Strictly disabled and inert in non-local / production deployments.
 */

import { syncOfflineQueue } from './sync';
import { getPendingOfflineCount } from './db';

const STORAGE_KEY = 'nebengbeli_e2e_offline';
let memorySimulatedOffline = false;

export function isLocalOrDevEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check Vite development mode or test mode
  try {
    const metaEnv = (import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } })?.env;
    if (metaEnv && (metaEnv.DEV || metaEnv.MODE === 'test')) {
      return true;
    }
  } catch {
    // Environment meta may not be present in all runtimes
  }

  // Explicit test harness flag
  if ((window as unknown as { __E2E_MODE__?: boolean }).__E2E_MODE__ === true) {
    return true;
  }

  const host = window.location.hostname;
  if (!host) return false;

  // Local, loopback, and private container bridge network addresses
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    host.startsWith('172.17.') ||
    host.startsWith('172.18.') ||
    host.startsWith('172.19.') ||
    host.startsWith('172.20.') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.')
  );
}

export function isSimulatedOffline(): boolean {
  if (!isLocalOrDevEnvironment()) {
    return false;
  }

  if (memorySimulatedOffline) {
    return true;
  }

  try {
    return window.sessionStorage?.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSimulatedOffline(offline: boolean): void {
  if (!isLocalOrDevEnvironment()) {
    console.warn('[E2E Network Seam] setSimulatedOffline ignored: not in local/development environment');
    return;
  }

  memorySimulatedOffline = offline;

  try {
    if (offline) {
      window.sessionStorage?.setItem(STORAGE_KEY, 'true');
    } else {
      window.sessionStorage?.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage access might be restricted in private/sandbox frames
  }

  // Dispatch both custom network mode change event and native window offline/online events
  window.dispatchEvent(
    new CustomEvent('nebengbeli:network-mode-change', {
      detail: { isOffline: offline, isOnline: !offline },
    })
  );
  window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
}

export function isAppOnline(): boolean {
  if (isSimulatedOffline()) {
    return false;
  }
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// Attach local test window interface for browser automation scripts (Camofox, Playwright, etc.)
if (typeof window !== 'undefined' && isLocalOrDevEnvironment()) {
  (window as unknown as { __NEBENGBELI_E2E__?: unknown }).__NEBENGBELI_E2E__ = {
    setOffline: (offline: boolean) => setSimulatedOffline(offline),
    isOffline: () => !isAppOnline(),
    isSimulatedOffline: () => isSimulatedOffline(),
    syncNow: () => syncOfflineQueue(),
    getPendingCount: () => getPendingOfflineCount(),
    resetOfflineState: () => setSimulatedOffline(false),
  };
}
