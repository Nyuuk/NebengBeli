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

export function isLoopbackHost(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== 'undefined' ? window.location?.hostname : '') ?? '')
    .trim()
    .toLowerCase();
  if (!host) return false;

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]'
  );
}

export function isLocalOrDevEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Every activation path is still loopback-gated. A test flag or Vite mode
  // must never make the seam available on a LAN, staging, or production host.
  const loopback = isLoopbackHost();
  if (!loopback) {
    return false;
  }

  // Explicit test harness flag
  if ((window as unknown as { __E2E_MODE__?: boolean }).__E2E_MODE__ === true) {
    return true;
  }

  // Allow explicit mock override in test suites
  if ((window as unknown as { __TEST_FORCE_PROD__?: boolean }).__TEST_FORCE_PROD__ === true) {
    return true;
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

  return true;
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

/**
 * Attaches the local E2E offline control seam to window in local/development environments.
 * Ensures the seam is inert and unattached in non-localhost and production environments.
 */
export function initOfflineNetworkSeam(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (isLocalOrDevEnvironment()) {
    (window as unknown as { __NEBENGBELI_E2E__?: unknown }).__NEBENGBELI_E2E__ = {
      setOffline: (offline: boolean) => setSimulatedOffline(offline),
      isOffline: () => !isAppOnline(),
      isSimulatedOffline: () => isSimulatedOffline(),
      syncNow: () => syncOfflineQueue(),
      getPendingCount: () => getPendingOfflineCount(),
      resetOfflineState: () => setSimulatedOffline(false),
    };
  } else {
    try {
      delete (window as unknown as { __NEBENGBELI_E2E__?: unknown }).__NEBENGBELI_E2E__;
    } catch {
      (window as unknown as { __NEBENGBELI_E2E__?: unknown }).__NEBENGBELI_E2E__ = undefined;
    }
  }
}

// Auto-initialize on module load if in browser
if (typeof window !== 'undefined') {
  initOfflineNetworkSeam();
}
