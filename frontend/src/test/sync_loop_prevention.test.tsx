import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { OnlineStatusProvider, useOnlineStatus } from '../context/OnlineStatusContext';
import { WalletDetailPage } from '../pages/WalletDetailPage';
import * as authApi from '../api/auth';
import * as statementsApi from '../api/statements';
import * as entriesApi from '../api/entries';
import { ApiError } from '../api/client';
import {
  syncOfflineQueue,
  resetSyncCooldown,
  getSyncCooldownState,
} from '../offline/sync';
import {
  queueOfflineEntry,
  setCachedUser,
  setCachedStatement,
  setCachedWallets,
  resetDBInstance,
  clearAllOfflineEntries,
  setCurrentUserId,
} from '../offline/db';
import { User, Wallet, StatementResponse } from '../types';

const mockUser: User = {
  id: 'usr-adnan-123',
  username: 'adnantesting123',
  role: 'user',
  created_at: '2026-02-22T10:00:00Z',
};

const mockWallet: Wallet = {
  id: 'wallet-503-test',
  name: 'Dompet Test 503 Loop',
  creator_id: 'usr-adnan-123',
  creator_username: 'adnantesting123',
  owner_id: 'usr-budi-456',
  owner_username: 'budi',
  balance: 100000,
  entry_count: 2,
  is_archived: false,
  user_role: 'creator',
  created_at: new Date().toISOString(),
};

const mockStatement: StatementResponse = {
  wallet: mockWallet,
  summary: {
    total_titipan: 50000,
    total_topup: 150000,
    total_koreksi: 0,
    current_balance: 100000,
    entry_count: 2,
  },
  entries: [
    {
      id: 'e-1',
      client_id: 'c-1',
      wallet_id: 'wallet-503-test',
      type: 'topup',
      amount: 150000,
      item_name: 'Top Up Awal',
      note: '',
      created_by: 'usr-adnan-123',
      created_at: '2026-02-22T10:00:00Z',
      occurred_at: '2026-02-22T10:00:00Z',
    },
    {
      id: 'e-2',
      client_id: 'c-2',
      wallet_id: 'wallet-503-test',
      type: 'titipan',
      amount: -50000,
      item_name: 'Beli Makan Siang',
      note: '',
      created_by: 'usr-adnan-123',
      created_at: '2026-02-22T10:05:00Z',
      occurred_at: '2026-02-22T10:05:00Z',
    },
  ],
  total: 2,
  page: 1,
  page_size: 50,
};

describe('API Spam Loop Prevention Suite (HTTP 503 Resistance)', () => {
  beforeEach(async () => {
    resetSyncCooldown();
    resetDBInstance();
    await clearAllOfflineEntries();
    vi.restoreAllMocks();

    setCurrentUserId(mockUser.id);
    await setCachedUser(mockUser);
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });
    vi.spyOn(authApi, 'renewAuthTokenApi').mockResolvedValue({
      message: 'token renewed',
      user: mockUser,
    });
  });

  it('enforces exponential backoff on syncOfflineQueue when server returns 503 and throttles immediate repeat calls', async () => {
    // 1. Queue an offline entry
    await queueOfflineEntry({
      client_id: 'offline-c1',
      wallet_id: 'wallet-503-test',
      type: 'titipan',
      amount: 25000,
      item_name: 'Kopi Susu 503',
      note: 'Extra Ice',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    });

    const createEntrySpy = vi.spyOn(entriesApi, 'createEntryApi').mockRejectedValue(
      new ApiError('Service Unavailable (HTTP 503)', 503)
    );

    let eventDetail: any = null;
    const eventListener = (e: Event) => {
      eventDetail = (e as CustomEvent).detail;
    };
    window.addEventListener('nebengbeli:synced', eventListener);

    try {
      // First sync attempt -> should fail with 503
      const firstResult = await syncOfflineQueue();
      expect(firstResult.failed).toBe(1);
      expect(createEntrySpy).toHaveBeenCalledTimes(1);
      expect(eventDetail).toEqual(
        expect.objectContaining({
          synced: 0,
          failed: 1,
          serverDown: true,
        })
      );

      // Verify cooldown is active
      const cooldownState = getSyncCooldownState();
      expect(cooldownState.consecutiveSyncFailures).toBe(1);
      expect(cooldownState.nextSyncAllowedAt).toBeGreaterThan(Date.now());

      // Second immediate sync attempt without force -> MUST BE THROTTLED (0 API calls)
      const secondResult = await syncOfflineQueue();
      expect(secondResult.synced).toBe(0);
      expect(secondResult.failed).toBe(0);
      expect(createEntrySpy).toHaveBeenCalledTimes(1); // Still 1, NOT called again!

      // Third sync attempt WITH force=true -> bypasses cooldown
      const thirdResult = await syncOfflineQueue(undefined, undefined, true);
      expect(thirdResult.failed).toBe(1);
      expect(createEntrySpy).toHaveBeenCalledTimes(2); // Called again due to force=true
    } finally {
      window.removeEventListener('nebengbeli:synced', eventListener);
    }
  });

  it('prevents WalletDetailPage from refetching getStatementApi when nebengbeli:synced reports 0 synced during 503', async () => {
    await setCachedStatement('wallet-503-test', {
      ...mockStatement,
      cached_at: new Date().toISOString(),
    }, mockUser.id);
    await setCachedWallets([mockWallet], 'all', mockUser.id);

    // Initial statement fetch succeeds or fails cleanly to cache
    const getStatementSpy = vi.spyOn(statementsApi, 'getStatementApi').mockRejectedValue(
      new ApiError('Service Unavailable (HTTP 503)', 503)
    );

    render(
      <MemoryRouter initialEntries={['/wallets/wallet-503-test']}>
        <AuthProvider>
          <OnlineStatusProvider>
            <Routes>
              <Route path="/wallets/:id" element={<WalletDetailPage />} />
            </Routes>
          </OnlineStatusProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for initial render to load from cache and auth to stabilize
    await waitFor(() => {
      expect(screen.getByText('Dompet Test 503 Loop')).toBeDefined();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    const initialCallCount = getStatementSpy.mock.calls.length;
    expect(initialCallCount).toBeGreaterThanOrEqual(1);

    // Now simulate sync failure event (synced: 0, serverDown: true)
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('nebengbeli:synced', {
          detail: { synced: 0, failed: 1, serverDown: true },
        })
      );
      // Wait past debounce time
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    // getStatementApi must NOT have been called again!
    expect(getStatementSpy).toHaveBeenCalledTimes(initialCallCount);
  });

  it('debounces getStatementApi when multiple successful sync events arrive rapidly', async () => {
    const getStatementSpy = vi.spyOn(statementsApi, 'getStatementApi').mockResolvedValue(mockStatement);

    render(
      <MemoryRouter initialEntries={['/wallets/wallet-503-test']}>
        <AuthProvider>
          <OnlineStatusProvider>
            <Routes>
              <Route path="/wallets/:id" element={<WalletDetailPage />} />
            </Routes>
          </OnlineStatusProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Dompet Test 503 Loop')).toBeDefined();
    });

    const callsAfterMount = getStatementSpy.mock.calls.length;

    // Fire 5 rapid synced events with synced > 0
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(
          new CustomEvent('nebengbeli:synced', {
            detail: { synced: 1, failed: 0 },
          })
        );
      }
      // Wait for debounce timer (300ms) to resolve
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    // Debounce must consolidate the 5 rapid events into exactly 1 additional getStatementApi call
    expect(getStatementSpy).toHaveBeenCalledTimes(callsAfterMount + 1);
  });

  it('guarantees OnlineStatusProvider does not enter an infinite loop when pending offline entries fail with 503', async () => {
    // Queue offline entry
    await queueOfflineEntry({
      client_id: 'offline-loop-entry',
      wallet_id: 'wallet-503-test',
      type: 'titipan',
      amount: 15000,
      item_name: 'Pentol Bakar',
      note: '',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    });

    const createEntrySpy = vi.spyOn(entriesApi, 'createEntryApi').mockRejectedValue(
      new ApiError('Service Unavailable (HTTP 503)', 503)
    );

    const SyncWatcher: React.FC = () => {
      const { pendingCount, isSyncing } = useOnlineStatus();
      return (
        <div>
          <span data-testid="pending">{pendingCount}</span>
          <span data-testid="syncing">{isSyncing ? 'yes' : 'no'}</span>
        </div>
      );
    };

    render(
      <AuthProvider>
        <OnlineStatusProvider>
          <SyncWatcher />
        </OnlineStatusProvider>
      </AuthProvider>
    );

    // Allow time for mount effect and initial sync attempt
    await waitFor(() => {
      expect(createEntrySpy).toHaveBeenCalledTimes(1);
    });

    // Wait 500ms to verify that NO infinite loop occurs
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    // It must still be exactly 1 call (no endless loop!)
    expect(createEntrySpy).toHaveBeenCalledTimes(1);
  });
});
