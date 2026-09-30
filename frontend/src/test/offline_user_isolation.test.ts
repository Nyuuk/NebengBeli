import { describe, it, expect, beforeEach } from 'vitest';
import {
  queueOfflineEntry,
  getPendingOfflineEntries,
  getPendingOfflineCount,
  getAllOfflineEntries,
  removePendingOfflineEntry,
  markOfflineEntryFailed,
  moveFailedOfflineEntry,
  retryFailedOfflineEntry,
  setCurrentUserId,
  setCachedWallets,
  getCachedWallets,
  saveShoppingDraft,
  getShoppingDraft,
  hasShoppingDraft,
  clearAllOfflineEntries,
  resetDBInstance,
} from '../offline/db';
import { PendingOfflineEntry, Wallet, ShoppingSessionDraft } from '../types';

describe('User-Bound Offline Storage & Session Invalidation Holding', () => {
  beforeEach(async () => {
    resetDBInstance();
    await clearAllOfflineEntries();
  });

  it('holds offline queue and drafts when session is invalidated until same user returns', async () => {
    // 1. User A logs in
    setCurrentUserId('user-A');

    const entryA: PendingOfflineEntry = {
      client_id: 'client-A-1',
      wallet_id: 'wallet-A',
      type: 'titipan',
      amount: 15000,
      item_name: 'Es Kopi User A',
      note: '',
      occurred_at: '2026-09-30T08:00:00Z',
      created_at: '2026-09-30T08:00:00Z',
      retry_count: 0,
      status: 'pending',
    };

    await queueOfflineEntry(entryA);

    const draftA: ShoppingSessionDraft = {
      rows: [
        {
          rowId: 'row-1',
          wallet_id: 'wallet-A',
          item_name: 'Donat Cokelat',
          amount_str: '8000',
          amount: 8000,
          note: '',
        },
      ],
      occurred_at: '2026-09-30T08:05:00Z',
      saved_at: '2026-09-30T08:05:00Z',
    };
    await saveShoppingDraft(draftA);

    expect(await getPendingOfflineCount('user-A')).toBe(1);
    expect(await hasShoppingDraft('user-A')).toBe(true);

    // 2. Session is invalidated (e.g. token expired, password reset, or logout)
    setCurrentUserId(null);

    // 3. User B logs in
    setCurrentUserId('user-B');

    // User B should not see User A's pending offline entries or draft
    const pendingB = await getPendingOfflineEntries('user-B');
    expect(pendingB.length).toBe(0);
    expect(await getPendingOfflineCount('user-B')).toBe(0);
    expect(await getShoppingDraft('user-B')).toBeNull();

    // User B queues an item
    const entryB: PendingOfflineEntry = {
      client_id: 'client-B-1',
      wallet_id: 'wallet-B',
      type: 'titipan',
      amount: 30000,
      item_name: 'Soto Ayam User B',
      note: '',
      occurred_at: '2026-09-30T09:00:00Z',
      created_at: '2026-09-30T09:00:00Z',
      retry_count: 0,
      status: 'pending',
    };
    await queueOfflineEntry(entryB);
    expect(await getPendingOfflineCount('user-B')).toBe(1);

    // 4. User A returns and logs back in
    setCurrentUserId('user-A');

    const pendingARestored = await getPendingOfflineEntries('user-A');
    expect(pendingARestored.length).toBe(1);
    expect(pendingARestored[0].item_name).toBe('Es Kopi User A');

    const draftARestored = await getShoppingDraft('user-A');
    expect(draftARestored?.rows[0].item_name).toBe('Donat Cokelat');
  });

  it('handles failed-sync actions: discard, move to other wallet preserving client_id & chronological replay', async () => {
    setCurrentUserId('user-creator');

    const failedEntry: PendingOfflineEntry = {
      client_id: 'fixed-client-uuid-999',
      wallet_id: 'wallet-source-1',
      type: 'titipan',
      amount: 25000,
      item_name: 'Bakso Malang',
      note: 'Komplit',
      occurred_at: '2026-09-30T07:30:00Z',
      created_at: '2026-09-30T07:30:00Z',
      retry_count: 1,
      status: 'pending',
    };

    await queueOfflineEntry(failedEntry);
    expect(await getPendingOfflineCount()).toBe(1);

    // Mark failed by server
    await markOfflineEntryFailed('fixed-client-uuid-999', 'Dompet asal telah diarsipkan');
    expect(await getPendingOfflineCount()).toBe(0);

    const allEntries = await getAllOfflineEntries();
    expect(allEntries[0].status).toBe('failed');
    expect(allEntries[0].error_message).toBe('Dompet asal telah diarsipkan');

    // Move failed entry to target wallet
    await moveFailedOfflineEntry('fixed-client-uuid-999', 'wallet-target-2');

    const pendingAfterMove = await getPendingOfflineEntries();
    expect(pendingAfterMove.length).toBe(1);
    expect(pendingAfterMove[0].wallet_id).toBe('wallet-target-2');
    // Verifies client_id idempotency is preserved
    expect(pendingAfterMove[0].client_id).toBe('fixed-client-uuid-999');
    // Verifies chronological occurred_at timestamp is preserved
    expect(pendingAfterMove[0].occurred_at).toBe('2026-09-30T07:30:00Z');
    expect(pendingAfterMove[0].status).toBe('pending');
    expect(pendingAfterMove[0].error_message).toBeUndefined();

    // Test mark failed again then retry
    await markOfflineEntryFailed('fixed-client-uuid-999', 'Temporary network issue');
    expect(await getPendingOfflineCount()).toBe(0);
    await retryFailedOfflineEntry('fixed-client-uuid-999');
    expect(await getPendingOfflineCount()).toBe(1);

    // Discard test
    await removePendingOfflineEntry('fixed-client-uuid-999');
    expect(await getPendingOfflineCount()).toBe(0);
  });

  it('isolates cached wallets per user', async () => {
    const walletsUser1: Wallet[] = [
      {
        id: 'w-1',
        name: 'Buku User 1',
        creator_id: 'u-1',
        balance: 10000,
        entry_count: 1,
        is_archived: false,
        created_at: new Date().toISOString(),
      },
    ];

    const walletsUser2: Wallet[] = [
      {
        id: 'w-2',
        name: 'Buku User 2',
        creator_id: 'u-2',
        balance: 50000,
        entry_count: 4,
        is_archived: false,
        created_at: new Date().toISOString(),
      },
    ];

    await setCachedWallets(walletsUser1, 'all', 'u-1');
    await setCachedWallets(walletsUser2, 'all', 'u-2');

    const cached1 = await getCachedWallets('all', 'u-1');
    const cached2 = await getCachedWallets('all', 'u-2');

    expect(cached1?.wallets[0].name).toBe('Buku User 1');
    expect(cached2?.wallets[0].name).toBe('Buku User 2');
  });
});
