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

  it('provides deterministic human-readable accessible names for repeated row controls in rows 1 and 2', () => {
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

    // Row 1 accessible controls
    const wallet1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    const item1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    const amount1 = screen.getByRole('textbox', { name: 'Harga baris 1' });
    const note1 = screen.getByRole('textbox', { name: 'Catatan baris 1' });
    const delete1 = screen.getByRole('button', { name: 'Hapus baris 1' });

    expect(wallet1).toBeDefined();
    expect(item1).toBeDefined();
    expect(amount1).toBeDefined();
    expect(note1).toBeDefined();
    expect(delete1).toBeDefined();

    // Placeholders are preserved
    expect(wallet1.getAttribute('placeholder')).toBe('Pilih buku...');
    expect(item1.getAttribute('placeholder')).toBe('Contoh: Kopi Susu');
    expect(amount1.getAttribute('placeholder')).toBe('0');
    expect(note1.getAttribute('placeholder')).toBe('Opsional');

    // Row 2 accessible controls
    const wallet2 = screen.getByRole('combobox', { name: 'Buku baris 2' });
    const item2 = screen.getByRole('combobox', { name: 'Barang baris 2' });
    const amount2 = screen.getByRole('textbox', { name: 'Harga baris 2' });
    const note2 = screen.getByRole('textbox', { name: 'Catatan baris 2' });
    const delete2 = screen.getByRole('button', { name: 'Hapus baris 2' });

    expect(wallet2).toBeDefined();
    expect(item2).toBeDefined();
    expect(amount2).toBeDefined();
    expect(note2).toBeDefined();
    expect(delete2).toBeDefined();

    expect(wallet2.getAttribute('placeholder')).toBe('Pilih buku...');
    expect(item2.getAttribute('placeholder')).toBe('Contoh: Kopi Susu');
    expect(amount2.getAttribute('placeholder')).toBe('0');
    expect(note2.getAttribute('placeholder')).toBe('Opsional');
  });

  it('allows filling rows using accessible names and preserves autocomplete & save flow', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const batchSpy = vi.spyOn(entriesApi, 'batchCreateEntriesApi').mockResolvedValue({
      entries: [],
      count: 2,
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

    // Row 1 - select wallet via Autocomplete
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    // Row 1 - fill item, amount, note
    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.change(itemInput1, { target: { value: 'Es Kopi Susu' } });

    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' });
    fireEvent.change(amountInput1, { target: { value: '15000' } });

    const noteInput1 = screen.getByRole('textbox', { name: 'Catatan baris 1' });
    fireEvent.change(noteInput1, { target: { value: 'Less sugar' } });

    // Row 2 - select wallet via Autocomplete
    const walletInput2 = screen.getByRole('combobox', { name: 'Buku baris 2' });
    fireEvent.focus(walletInput2);
    fireEvent.change(walletInput2, { target: { value: 'Budi' } });
    fireEvent.keyDown(walletInput2, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput2, { key: 'Enter' });

    // Row 2 - fill item, amount, note
    const itemInput2 = screen.getByRole('combobox', { name: 'Barang baris 2' });
    fireEvent.change(itemInput2, { target: { value: 'Nasi Padang' } });

    const amountInput2 = screen.getByRole('textbox', { name: 'Harga baris 2' });
    fireEvent.change(amountInput2, { target: { value: '25000' } });

    const noteInput2 = screen.getByRole('textbox', { name: 'Catatan baris 2' });
    fireEvent.change(noteInput2, { target: { value: 'Ayam bakar' } });

    // Save
    const saveBtn = await screen.findByRole('button', { name: /Simpan Semua/i });
    expect(saveBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(batchSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            wallet_id: 'w-1',
            item_name: 'Es Kopi Susu',
            amount: 15000,
            note: 'Less sugar',
          }),
          expect.objectContaining({
            wallet_id: 'w-2',
            item_name: 'Nasi Padang',
            amount: 25000,
            note: 'Ayam bakar',
          }),
        ])
      );
      expect(handleSuccess).toHaveBeenCalledWith(2, false);
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
