import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShoppingSessionModal } from '../components/ShoppingSessionModal';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
import {
  saveShoppingDraft,
  clearShoppingDraft,
  clearAllOfflineEntries,
  getPendingOfflineCount,
  resetDBInstance,
} from '../offline/db';
import * as entriesApi from '../api/entries';
import * as walletsApi from '../api/wallets';
import { Wallet, ItemSuggestion } from '../types';

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

  it('reliably sets item_name and amount from last_price when selecting an item suggestion', async () => {
    const mockSuggestions: ItemSuggestion[] = [
      { item_name: 'Es Kopi Susu Aren', last_price: 18000, frequency: 5 },
      { item_name: 'Roti Panggang Keju', last_price: 15000, frequency: 3 },
    ];
    vi.spyOn(walletsApi, 'getItemSuggestionsApi').mockResolvedValue(mockSuggestions);

    const handleSuccess = vi.fn();
    const handleClose = vi.fn();
    const batchSpy = vi.spyOn(entriesApi, 'batchCreateEntriesApi').mockResolvedValue({
      entries: [],
      count: 1,
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

    // Select wallet on row 1
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    // Wait for suggestions to load
    await waitFor(() => {
      expect(walletsApi.getItemSuggestionsApi).toHaveBeenCalledWith('w-1');
    });

    // Select item suggestion on row 1
    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.focus(itemInput1);
    fireEvent.keyDown(itemInput1, { key: 'ArrowDown' }); // opens dropdown
    const option = await screen.findByText('Es Kopi Susu Aren');
    fireEvent.click(option);

    // Verify item_name and amount are populated from suggestion
    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' }) as HTMLInputElement;
    expect((itemInput1 as HTMLInputElement).value).toBe('Es Kopi Susu Aren');
    expect(amountInput1.value).toBe('18000');

    // Verify row 2 is empty/unfilled and total is calculated from row 1
    expect(screen.getByText('Simpan Semua (1 Titipan - Rp 18.000)')).toBeDefined();

    // Submit batch
    const saveBtn = screen.getByRole('button', { name: /Simpan Semua/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(batchSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            wallet_id: 'w-1',
            item_name: 'Es Kopi Susu Aren',
            amount: 18000,
          }),
        ])
      );
      expect(handleSuccess).toHaveBeenCalledWith(1, false);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('reliably sets item_name and amount despite MUI onInputChange ordering (reset before/after onChange)', async () => {
    const mockSuggestions: ItemSuggestion[] = [
      { item_name: 'Matcha Latte', last_price: 22000, frequency: 2 },
    ];
    vi.spyOn(walletsApi, 'getItemSuggestionsApi').mockResolvedValue(mockSuggestions);

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

    // Select wallet on row 1
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    await waitFor(() => {
      expect(walletsApi.getItemSuggestionsApi).toHaveBeenCalledWith('w-1');
    });

    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' }) as HTMLInputElement;

    // Simulate typing text that matches suggestion and pressing enter
    fireEvent.focus(itemInput1);
    fireEvent.change(itemInput1, { target: { value: 'Matcha Latte' } });
    fireEvent.keyDown(itemInput1, { key: 'Enter' });

    await waitFor(() => {
      expect((itemInput1 as HTMLInputElement).value).toBe('Matcha Latte');
      expect(amountInput1.value).toBe('22000');
    });
  });

  it('preserves freeSolo typed custom text and custom amount without suggestion matching', async () => {
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

    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' }) as HTMLInputElement;
    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' }) as HTMLInputElement;

    fireEvent.change(itemInput1, { target: { value: 'Martabak Manis Spesial' } });
    fireEvent.change(amountInput1, { target: { value: '45000' } });

    expect(itemInput1.value).toBe('Martabak Manis Spesial');
    expect(amountInput1.value).toBe('45000');
  });

  it('allows user to manually override amount after selecting an item suggestion', async () => {
    const mockSuggestions: ItemSuggestion[] = [
      { item_name: 'Es Kopi Susu Aren', last_price: 18000, frequency: 4 },
    ];
    vi.spyOn(walletsApi, 'getItemSuggestionsApi').mockResolvedValue(mockSuggestions);

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

    // Select wallet
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    await waitFor(() => {
      expect(walletsApi.getItemSuggestionsApi).toHaveBeenCalledWith('w-1');
    });

    // Select suggestion
    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.focus(itemInput1);
    fireEvent.keyDown(itemInput1, { key: 'ArrowDown' });
    const option = await screen.findByText('Es Kopi Susu Aren');
    fireEvent.click(option);

    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' }) as HTMLInputElement;
    expect(amountInput1.value).toBe('18000');

    // Override amount manually
    fireEvent.change(amountInput1, { target: { value: '20000' } });
    expect(amountInput1.value).toBe('20000');
    expect(screen.getByText('Simpan Semua (1 Titipan - Rp 20.000)')).toBeDefined();
  });

  it('handles item suggestion with last_price = 0 without setting amount to 0 string', async () => {
    const mockSuggestions: ItemSuggestion[] = [
      { item_name: 'Barang Tanpa Harga', last_price: 0, frequency: 1 },
    ];
    vi.spyOn(walletsApi, 'getItemSuggestionsApi').mockResolvedValue(mockSuggestions);

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

    // Select wallet
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    await waitFor(() => {
      expect(walletsApi.getItemSuggestionsApi).toHaveBeenCalledWith('w-1');
    });

    // Select suggestion
    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.focus(itemInput1);
    fireEvent.keyDown(itemInput1, { key: 'ArrowDown' });
    const option = await screen.findByText('Barang Tanpa Harga');
    fireEvent.click(option);

    expect((itemInput1 as HTMLInputElement).value).toBe('Barang Tanpa Harga');
    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' }) as HTMLInputElement;
    expect(amountInput1.value).toBe('');
  });

  it('blocks mixed valid + invalid batch with Indonesian validation error and makes zero online API writes', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();
    const batchSpy = vi.spyOn(entriesApi, 'batchCreateEntriesApi').mockResolvedValue({
      entries: [],
      count: 1,
    });
    const createSpy = vi.spyOn(entriesApi, 'createEntryApi');

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

    // Row 1 - valid
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.change(itemInput1, { target: { value: 'Es Kopi' } });

    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' });
    fireEvent.change(amountInput1, { target: { value: '15000' } });

    // Row 2 - invalid (wallet selected, but item and amount empty)
    const walletInput2 = screen.getByRole('combobox', { name: 'Buku baris 2' });
    fireEvent.focus(walletInput2);
    fireEvent.change(walletInput2, { target: { value: 'Budi' } });
    fireEvent.keyDown(walletInput2, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput2, { key: 'Enter' });

    // Submit batch
    const saveBtn = screen.getByRole('button', { name: /Simpan Semua/i });
    fireEvent.click(saveBtn);

    // Assert visible Indonesian error and zero API writes
    await waitFor(() => {
      expect(screen.getByText(/Terdapat baris titipan yang belum lengkap/i)).toBeDefined();
    });
    expect(batchSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(handleSuccess).not.toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('blocks mixed valid + invalid batch in offline mode with Indonesian validation error and makes zero offline queue writes', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const handleSuccess = vi.fn();
    const handleClose = vi.fn();
    const batchSpy = vi.spyOn(entriesApi, 'batchCreateEntriesApi');
    const createSpy = vi.spyOn(entriesApi, 'createEntryApi');

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

    // Row 1 - valid
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.change(itemInput1, { target: { value: 'Es Kopi' } });

    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' });
    fireEvent.change(amountInput1, { target: { value: '15000' } });

    // Row 2 - invalid (item typed, but wallet and amount empty)
    const itemInput2 = screen.getByRole('combobox', { name: 'Barang baris 2' });
    fireEvent.change(itemInput2, { target: { value: 'Nasi Bungkus' } });

    // Submit batch
    const saveBtn = screen.getByRole('button', { name: /Simpan Semua/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Terdapat baris titipan yang belum lengkap/i)).toBeDefined();
    });

    // Zero writes
    expect(batchSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(await getPendingOfflineCount()).toBe(0);
    expect(handleSuccess).not.toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('proceeds with valid two-row batch save when both rows are complete', async () => {
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

    // Row 1
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.change(itemInput1, { target: { value: 'Es Kopi' } });

    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' });
    fireEvent.change(amountInput1, { target: { value: '18000' } });

    // Row 2
    const walletInput2 = screen.getByRole('combobox', { name: 'Buku baris 2' });
    fireEvent.focus(walletInput2);
    fireEvent.change(walletInput2, { target: { value: 'Budi' } });
    fireEvent.keyDown(walletInput2, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput2, { key: 'Enter' });

    const itemInput2 = screen.getByRole('combobox', { name: 'Barang baris 2' });
    fireEvent.change(itemInput2, { target: { value: 'Nasi Ayam' } });

    const amountInput2 = screen.getByRole('textbox', { name: 'Harga baris 2' });
    fireEvent.change(amountInput2, { target: { value: '25000' } });

    const saveBtn = screen.getByRole('button', { name: /Simpan Semua/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(batchSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            wallet_id: 'w-1',
            item_name: 'Es Kopi',
            amount: 18000,
          }),
          expect.objectContaining({
            wallet_id: 'w-2',
            item_name: 'Nasi Ayam',
            amount: 25000,
          }),
        ])
      );
      expect(handleSuccess).toHaveBeenCalledWith(2, false);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('ignores wholly blank extra row and proceeds with single valid row save', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();
    const batchSpy = vi.spyOn(entriesApi, 'batchCreateEntriesApi').mockResolvedValue({
      entries: [],
      count: 1,
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

    // Row 1 - valid
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.change(itemInput1, { target: { value: 'Kopi Susu' } });

    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' });
    fireEvent.change(amountInput1, { target: { value: '15000' } });

    // Row 2 is left wholly blank

    const saveBtn = screen.getByRole('button', { name: /Simpan Semua/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(batchSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            wallet_id: 'w-1',
            item_name: 'Kopi Susu',
            amount: 15000,
          }),
        ])
      );
      expect(batchSpy.mock.calls[0][0].length).toBe(1);
      expect(handleSuccess).toHaveBeenCalledWith(1, false);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('initializes datetime input with browser-local time and accurately submits ISO timestamp', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const batchSpy = vi.spyOn(entriesApi, 'batchCreateEntriesApi').mockResolvedValue({
      entries: [],
      count: 1,
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

    const timeInput = screen.getByLabelText('Waktu Belanja') as HTMLInputElement;
    expect(timeInput).toBeDefined();
    expect(timeInput.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    // Set a custom local time
    fireEvent.change(timeInput, { target: { value: '2026-10-15T14:30' } });

    // Row 1 - valid
    const walletInput1 = screen.getByRole('combobox', { name: 'Buku baris 1' });
    fireEvent.focus(walletInput1);
    fireEvent.change(walletInput1, { target: { value: 'Rendy' } });
    fireEvent.keyDown(walletInput1, { key: 'ArrowDown' });
    fireEvent.keyDown(walletInput1, { key: 'Enter' });

    const itemInput1 = screen.getByRole('combobox', { name: 'Barang baris 1' });
    fireEvent.change(itemInput1, { target: { value: 'Kopi Kenangan' } });

    const amountInput1 = screen.getByRole('textbox', { name: 'Harga baris 1' });
    fireEvent.change(amountInput1, { target: { value: '20000' } });

    const saveBtn = screen.getByRole('button', { name: /Simpan Semua/i });
    fireEvent.click(saveBtn);

    const expectedISO = new Date(2026, 9, 15, 14, 30, 0, 0).toISOString();

    await waitFor(() => {
      expect(batchSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            wallet_id: 'w-1',
            item_name: 'Kopi Kenangan',
            amount: 20000,
            occurred_at: expectedISO,
          }),
        ])
      );
      expect(handleSuccess).toHaveBeenCalledWith(1, false);
    });
  });
});
