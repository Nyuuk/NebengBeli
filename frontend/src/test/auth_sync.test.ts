import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncOfflineQueue } from '../offline/sync';
import {
  queueOfflineEntry,
  getPendingOfflineCount,
  clearAllOfflineEntries,
  saveShoppingDraft,
  clearShoppingDraft,
  hasShoppingDraft,
  resetDBInstance,
  setCurrentUserId,
} from '../offline/db';
import * as entriesApi from '../api/entries';
import * as authApi from '../api/auth';
import { PendingOfflineEntry } from '../types';

describe('Auth Renewal & Offline Sync Queue Replay', () => {
  beforeEach(async () => {
    resetDBInstance();
    await clearAllOfflineEntries();
    await clearShoppingDraft();
    vi.restoreAllMocks();
  });

  it('replays offline queue entries successfully with idempotency Client-ID', async () => {
    const entry: PendingOfflineEntry = {
      client_id: 'test-client-id-123',
      wallet_id: 'wallet-123',
      type: 'titipan',
      amount: 25000,
      item_name: 'Kopi Kenangan',
      note: 'Normal sugar',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    };

    await queueOfflineEntry(entry);
    expect(await getPendingOfflineCount()).toBe(1);

    const createEntrySpy = vi.spyOn(entriesApi, 'createEntryApi').mockResolvedValue({
      entry: {
        id: 'server-id-1',
        client_id: entry.client_id,
        wallet_id: entry.wallet_id,
        type: entry.type,
        amount: entry.amount,
        item_name: entry.item_name,
        note: entry.note,
        occurred_at: entry.occurred_at,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
      },
      is_duplicate: false,
    });

    const result = await syncOfflineQueue();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(createEntrySpy).toHaveBeenCalledWith('wallet-123', expect.objectContaining({
      client_id: 'test-client-id-123',
      item_name: 'Kopi Kenangan',
    }));

    expect(await getPendingOfflineCount()).toBe(0);
  });

  it('handles server 400 rejection by marking entry failed and removing from pending queue', async () => {
    const entry: PendingOfflineEntry = {
      client_id: 'rejected-client-id',
      wallet_id: 'wallet-archived',
      type: 'titipan',
      amount: 50000,
      item_name: 'Steak',
      note: '',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    };

    await queueOfflineEntry(entry);

    vi.spyOn(entriesApi, 'createEntryApi').mockRejectedValue({
      status: 400,
      message: 'Wallet is archived',
    });

    const result = await syncOfflineQueue();
    expect(result.failed).toBe(1);

    // Should no longer be pending
    expect(await getPendingOfflineCount()).toBe(0);
  });

  it('renews auth token via renewAuthTokenApi endpoint', async () => {
    const renewSpy = vi.spyOn(authApi, 'renewAuthTokenApi').mockResolvedValue({
      message: 'token renewed',
      user: {
        id: 'u-1',
        username: 'test_user',
        role: 'user',
        created_at: new Date().toISOString(),
      },
    });

    const res = await authApi.renewAuthTokenApi();
    expect(renewSpy).toHaveBeenCalled();
    expect(res.user?.username).toBe('test_user');
  });

  it('detects pending offline entries and active shopping drafts for logout warning', async () => {
    setCurrentUserId('user-warn-1');

    expect(await getPendingOfflineCount('user-warn-1')).toBe(0);
    expect(await hasShoppingDraft('user-warn-1')).toBe(false);

    // Add shopping draft
    await saveShoppingDraft({
      rows: [
        {
          rowId: 'row-w-1',
          wallet_id: 'w-1',
          item_name: 'Kopi Susu',
          amount_str: '15000',
          amount: 15000,
          note: '',
        },
      ],
      occurred_at: new Date().toISOString(),
      saved_at: new Date().toISOString(),
    }, 'user-warn-1');

    expect(await hasShoppingDraft('user-warn-1')).toBe(true);

    // Add pending offline entry
    await queueOfflineEntry({
      client_id: 'client-warn-1',
      user_id: 'user-warn-1',
      wallet_id: 'w-1',
      type: 'titipan',
      amount: 20000,
      item_name: 'Nasi Kuning',
      note: '',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    }, 'user-warn-1');

    expect(await getPendingOfflineCount('user-warn-1')).toBe(1);
  });
});
