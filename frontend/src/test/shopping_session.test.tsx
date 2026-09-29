import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShoppingSessionModal } from '../components/ShoppingSessionModal';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
import {
  saveShoppingDraft,
  clearShoppingDraft,
  clearAllOfflineEntries,
  resetDBInstance,
} from '../offline/db';
import * as entriesApi from '../api/entries';
import { Wallet } from '../types';

describe('Sesi Belanja (F1 Multi-row Batch Entry)', () => {
  const mockWallets: Wallet[] = [
    {
      id: 'w-1',
      name: 'Rendy - Kopi',
      creator_id: 'user-ob',
      creator_username: 'rahmat',
      owner_id: 'user-rendy',
      owner_username: 'rendy',
      balance: 10000,
      entry_count: 2,
      is_archived: false,
      user_role: 'creator',
      created_at: new Date().toISOString(),
    },
    {
      id: 'w-2',
      name: 'Budi - Makan Siang',
      creator_id: 'user-ob',
      creator_username: 'rahmat',
      owner_id: 'user-budi',
      owner_username: 'budi',
      balance: 20000,
      entry_count: 3,
      is_archived: false,
      user_role: 'creator',
      created_at: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    resetDBInstance();
    await clearAllOfflineEntries();
    await clearShoppingDraft();
    vi.restoreAllMocks();
  });

  it('renders shopping session with initial empty rows and total sum', () => {
    render(
      <OnlineStatusProvider>
        <ShoppingSessionModal
          open={true}
          wallets={mockWallets}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </OnlineStatusProvider>
    );

    expect(screen.getByText(/Sesi Belanja/i)).toBeDefined();
    expect(screen.getByText('Tambah Baris Titipan')).toBeDefined();
    expect(screen.getAllByText('Rp 0', { exact: false }).length).toBeGreaterThan(0);
  });

  it('restores draft automatically from IndexedDB', async () => {
    await saveShoppingDraft({
      rows: [
        {
          rowId: 'row-draft-1',
          wallet_id: 'w-1',
          item_name: 'Kopi Susu Gula Aren',
          amount_str: '18000',
          amount: 18000,
          note: 'Kurangi manis',
        },
      ],
      occurred_at: '2026-09-29T12:00',
      saved_at: new Date().toISOString(),
    });

    render(
      <OnlineStatusProvider>
        <ShoppingSessionModal
          open={true}
          wallets={mockWallets}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </OnlineStatusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Draft Tersimpan Dipulihkan')).toBeDefined();
    });
  });

  it('saves batch entries via batchCreateEntriesApi when online', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const batchSpy = vi.spyOn(entriesApi, 'batchCreateEntriesApi').mockResolvedValue({
      entries: [],
      count: 1,
    });

    // Save initial draft with 1 valid row
    await saveShoppingDraft({
      rows: [
        {
          rowId: 'r-1',
          wallet_id: 'w-1',
          item_name: 'Es Kopi',
          amount_str: '20000',
          amount: 20000,
          note: '',
        },
      ],
      occurred_at: '2026-09-29T12:00',
      saved_at: new Date().toISOString(),
    });

    render(
      <OnlineStatusProvider>
        <ShoppingSessionModal
          open={true}
          wallets={mockWallets}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </OnlineStatusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Draft Tersimpan Dipulihkan')).toBeDefined();
    });

    const saveBtn = screen.getByRole('button', { name: /Simpan Semua/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(batchSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            wallet_id: 'w-1',
            item_name: 'Es Kopi',
            amount: 20000,
          }),
        ])
      );
      expect(handleSuccess).toHaveBeenCalledWith(1, false);
    });
  });
});
