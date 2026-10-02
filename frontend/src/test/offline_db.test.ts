import { describe, it, expect, beforeEach } from 'vitest';
import {
  queueOfflineEntry,
  getPendingOfflineEntries,
  getPendingOfflineCount,
  removePendingOfflineEntry,
  markOfflineEntryFailed,
  setCachedWallets,
  getCachedWallets,
  setCachedStatement,
  getCachedStatement,
  setCachedSuggestions,
  getCachedSuggestions,
  saveShoppingDraft,
  getShoppingDraft,
  clearShoppingDraft,
  clearAllOfflineEntries,
  resetDBInstance,
} from '../offline/db';
import { PendingOfflineEntry, Wallet, StatementResponse, ItemSuggestion, ShoppingSessionDraft } from '../types';

describe('IndexedDB Offline DB & Cache Management', () => {
  beforeEach(async () => {
    resetDBInstance();
    await clearAllOfflineEntries();
    await clearShoppingDraft();
  });

  it('should queue pending offline entries and count them correctly', async () => {
    const entry1: PendingOfflineEntry = {
      client_id: 'client-uuid-1',
      wallet_id: 'wallet-uuid-1',
      type: 'titipan',
      amount: -25000,
      item_name: 'Kopi Susu',
      note: 'Less sugar',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    };

    const entry2: PendingOfflineEntry = {
      client_id: 'client-uuid-2',
      wallet_id: 'wallet-uuid-1',
      type: 'topup',
      amount: 50000,
      item_name: 'Transfer BCA',
      note: '',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      retry_count: 0,
      status: 'pending',
    };

    await queueOfflineEntry(entry1);
    await queueOfflineEntry(entry2);

    const count = await getPendingOfflineCount();
    expect(count).toBe(2);

    const pending = await getPendingOfflineEntries();
    expect(pending.length).toBe(2);
    expect(pending[0].item_name).toBe('Kopi Susu');
    expect(pending[1].item_name).toBe('Transfer BCA');

    // Remove entry1
    await removePendingOfflineEntry('client-uuid-1');
    const updatedCount = await getPendingOfflineCount();
    expect(updatedCount).toBe(1);
  });

  it('should mark failed entries and exclude them from pending queue count', async () => {
    const entry: PendingOfflineEntry = {
      client_id: 'client-uuid-fail',
      wallet_id: 'wallet-uuid-fail',
      type: 'titipan',
      amount: 15000,
      item_name: 'Nasi Bungkus',
      note: '',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      retry_count: 1,
      status: 'pending',
    };

    await queueOfflineEntry(entry);
    expect(await getPendingOfflineCount()).toBe(1);

    await markOfflineEntryFailed('client-uuid-fail', 'Dompet sudah diarsipkan');

    // Failed entries are not in pending count
    expect(await getPendingOfflineCount()).toBe(0);
    const pending = await getPendingOfflineEntries();
    expect(pending.length).toBe(0);
  });

  it('should cache and retrieve wallets list', async () => {
    const mockWallets: Wallet[] = [
      {
        id: 'w-1',
        name: 'Rendy - Kopi',
        creator_id: 'user-1',
        balance: 45000,
        entry_count: 3,
        is_archived: false,
        created_at: new Date().toISOString(),
      },
    ];

    await setCachedWallets(mockWallets, 'all');
    const cached = await getCachedWallets('all');

    expect(cached).not.toBeNull();
    expect(cached?.wallets.length).toBe(1);
    expect(cached?.wallets[0].name).toBe('Rendy - Kopi');
    expect(cached?.cached_at).toBeDefined();
  });

  it('should cache and retrieve wallet statements and item suggestions', async () => {
    const mockStatement: StatementResponse = {
      wallet: {
        id: 'w-1',
        name: 'Buku A',
        creator_id: 'u-1',
        balance: 20000,
        entry_count: 1,
        is_archived: false,
        created_at: new Date().toISOString(),
      },
      summary: {
        total_titipan: 20000,
        total_topup: 0,
        total_koreksi: 0,
        current_balance: 20000,
        entry_count: 1,
      },
      entries: [],
      total: 0,
      page: 1,
      page_size: 25,
    };

    await setCachedStatement('w-1', mockStatement);
    const cachedStmt = await getCachedStatement('w-1');
    expect(cachedStmt?.data.wallet.name).toBe('Buku A');

    const mockSuggestions: ItemSuggestion[] = [
      { item_name: 'Es Teh Manis', last_price: 5000, frequency: 12 },
    ];
    await setCachedSuggestions('w-1', mockSuggestions);
    const cachedSugg = await getCachedSuggestions('w-1');
    expect(cachedSugg?.suggestions[0].item_name).toBe('Es Teh Manis');
  });

  it('should save, retrieve, and clear shopping session drafts', async () => {
    const draft: ShoppingSessionDraft = {
      rows: [
        {
          rowId: 'row-1',
          wallet_id: 'w-1',
          item_name: 'Gorengan',
          amount_str: '10000',
          amount: 10000,
          note: 'Tahu dan tempe',
        },
      ],
      occurred_at: new Date().toISOString(),
      saved_at: new Date().toISOString(),
    };

    await saveShoppingDraft(draft);
    const retrieved = await getShoppingDraft();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.rows.length).toBe(1);
    expect(retrieved?.rows[0].item_name).toBe('Gorengan');

    await clearShoppingDraft();
    const afterClear = await getShoppingDraft();
    expect(afterClear).toBeNull();
  });
});
