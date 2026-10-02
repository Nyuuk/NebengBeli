import { describe, it, expect, vi, beforeEach } from 'vitest';
import { moveEntryAdapter } from '../api/entries';
import * as clientApi from '../api/client';
import {
  getPendingOfflineEntries,
  clearAllOfflineEntries,
  resetDBInstance,
} from '../offline/db';
import { Entry } from '../types';

describe('Wallet Move Typed Adapter & Mutation Replay', () => {
  const mockTargetEntry: Entry = {
    id: 'entry-orig-101',
    client_id: 'client-orig-101',
    wallet_id: 'wallet-source',
    type: 'titipan',
    amount: -35000,
    effective_amount: -35000,
    item_name: 'Bento Ayam',
    note: 'Pedas level 2',
    occurred_at: '2026-09-30T10:00:00Z',
    created_by: 'user-ob',
    created_at: '2026-09-30T10:00:00Z',
  };

  beforeEach(async () => {
    resetDBInstance();
    await clearAllOfflineEntries();
    vi.restoreAllMocks();
  });

  it('delegates to backend moveEntryApi when online', async () => {
    const requestSpy = vi.spyOn(clientApi, 'request').mockResolvedValue({
      message: 'entry moved successfully',
      correction_entry: {
        ...mockTargetEntry,
        id: 'corr-id',
        type: 'koreksi',
        amount: 35000,
      },
      new_entry: {
        ...mockTargetEntry,
        id: 'new-id',
        wallet_id: 'wallet-target',
      },
    });

    const result = await moveEntryAdapter({
      source_wallet_id: 'wallet-source',
      target_wallet_id: 'wallet-target',
      targetEntry: mockTargetEntry,
      notes: 'Salah catat ke teman sebelah',
      isOnline: true,
      userId: 'user-ob',
    });

    expect(result.is_offline).toBe(false);
    expect(requestSpy).toHaveBeenCalledWith(
      '/api/entries/move',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source_wallet_id: 'wallet-source',
          target_wallet_id: 'wallet-target',
          entry_id: 'entry-orig-101',
          notes: 'Salah catat ke teman sebelah',
        }),
      })
    );
  });

  it('decomposes into atomic offline correction and titipan mutations when offline', async () => {
    const result = await moveEntryAdapter({
      source_wallet_id: 'wallet-source',
      target_wallet_id: 'wallet-target',
      targetEntry: mockTargetEntry,
      notes: 'Salah catat',
      isOnline: false,
      userId: 'user-ob',
    });

    expect(result.is_offline).toBe(true);
    expect(result.correction_entry?.type).toBe('koreksi');
    expect(result.correction_entry?.amount).toBe(35000);
    expect(result.correction_entry?.wallet_id).toBe('wallet-source');

    expect(result.new_entry?.type).toBe('titipan');
    expect(result.new_entry?.amount).toBe(-35000);
    expect(result.new_entry?.wallet_id).toBe('wallet-target');

    // Check queued offline entries in IDB
    const pending = await getPendingOfflineEntries('user-ob');
    expect(pending.length).toBe(2);

    const corrPending = pending.find((p) => p.type === 'koreksi');
    expect(corrPending).toBeDefined();
    expect(corrPending?.wallet_id).toBe('wallet-source');
    expect(corrPending?.amount).toBe(35000);
    expect(corrPending?.corrects_entry_id).toBe('entry-orig-101');
    expect(corrPending?.correction_reason).toBe('Salah Dompet');

    const newPending = pending.find((p) => p.type === 'titipan');
    expect(newPending).toBeDefined();
    expect(newPending?.wallet_id).toBe('wallet-target');
    expect(newPending?.amount).toBe(-35000);
    expect(newPending?.item_name).toBe('Bento Ayam');
  });
});
