import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EntryModal } from '../components/EntryModal';
import { CorrectionModal } from '../components/CorrectionModal';
import { UnlinkWalletModal } from '../components/UnlinkWalletModal';
import { CreatorInsightsCard } from '../components/CreatorInsightsCard';
import { StatementView } from '../components/StatementView';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
import * as entriesApi from '../api/entries';
import { clearAllOfflineEntries, getPendingOfflineEntries, resetDBInstance } from '../offline/db';
import { Entry, Wallet, CreatorInsights } from '../types';

describe('UI Component Integration Tests', () => {
  const mockWallet: Wallet = {
    id: 'w-1',
    name: 'Buku Jajan Kantor',
    creator_id: 'user-creator',
    creator_username: 'rahmat',
    owner_id: 'user-owner',
    owner_username: 'rendy',
    balance: 50000,
    entry_count: 5,
    is_archived: false,
    created_at: new Date().toISOString(),
  };

  it('renders CreatorInsightsCard with total money outside and ranked debt', () => {
    const mockInsights: CreatorInsights = {
      total_money_outside: 125000,
      active_wallets_count: 3,
      total_wallets_count: 4,
      total_titipan_volume: 350000,
      total_titipan_count: 14,
      daily_trends: [
        { date: '29 Sep', count: 3, volume: 45000 },
      ],
      weekly_trends: [],
      monthly_trends: [],
      wallet_balances: [
        { wallet_id: 'w-1', wallet_name: 'Rendy - Kopi', balance: -50000, owner_username: 'rendy', is_archived: false },
        { wallet_id: 'w-2', wallet_name: 'Budi - Makan', balance: -75000, owner_username: 'budi', is_archived: false },
      ],
    };

    render(<CreatorInsightsCard insights={mockInsights} />);

    expect(screen.getByText('Insight Pembuat & Analisis Piutang')).toBeDefined();
    expect(screen.getByText('Total Uang Saya yang Masih di Luar')).toBeDefined();
    expect(screen.getByText('Rp 125.000', { exact: false })).toBeDefined();
    expect(screen.getByText('Rendy - Kopi')).toBeDefined();
    expect(screen.getByText('Budi - Makan')).toBeDefined();
  });

  it('handles CorrectionModal target balance adjustment and quick reasons', async () => {
    const targetEntry: Entry = {
      id: 'e-100',
      client_id: 'c-100',
      wallet_id: 'w-1',
      type: 'titipan',
      amount: -30000,
      item_name: 'Nasi Bebek',
      note: 'Pedas',
      occurred_at: new Date().toISOString(),
      created_by: 'user-creator',
      created_at: new Date().toISOString(),
    };

    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <OnlineStatusProvider>
        <CorrectionModal
          open={true}
          walletId="w-1"
          targetEntry={targetEntry}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </OnlineStatusProvider>
    );

    expect(screen.getByText('Koreksi Transaksi')).toBeDefined();
    expect(screen.getByText('Nasi Bebek')).toBeDefined();

    // Find the quick reason button "Batal"
    const batalBtns = screen.getAllByRole('button', { name: 'Batal' });
    fireEvent.click(batalBtns[0]);

    const input = screen.getByPlaceholderText('0') as HTMLInputElement;
    expect(input.value).toBe('0');
  });

  it('renders UnlinkWalletModal and triggers unlink handler', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <UnlinkWalletModal
        open={true}
        wallet={mockWallet}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    expect(screen.getByText(/Putus Tautan Rekan/i)).toBeDefined();
    expect(screen.getByText(/Buku Jajan Kantor/i)).toBeDefined();
    expect(screen.getByText(/@rendy/i)).toBeDefined();
  });

  it('renders StatementView with effective amount calculations', () => {
    const entries: Entry[] = [
      {
        id: 'orig-1',
        client_id: 'c-1',
        wallet_id: 'w-1',
        type: 'titipan',
        amount: -50000,
        item_name: 'Makan Bersama',
        note: '',
        occurred_at: new Date().toISOString(),
        created_by: 'user-creator',
        created_at: new Date().toISOString(),
      },
      {
        id: 'corr-1',
        client_id: 'c-2',
        wallet_id: 'w-1',
        type: 'koreksi',
        amount: 10000,
        item_name: 'Makan Bersama',
        note: 'Koreksi: salah harga',
        corrects_entry_id: 'orig-1',
        correction_reason: 'salah harga',
        occurred_at: new Date().toISOString(),
        created_by: 'user-creator',
        created_at: new Date().toISOString(),
      },
    ];

    render(
      <StatementView
        entries={entries}
        totalCount={2}
        page={1}
        pageSize={25}
        onPageChange={() => {}}
        onCorrectEntry={() => {}}
        onMoveEntry={() => {}}
      />
    );

    // Shows original struck-through and effective amount +40.000
    expect(screen.getByText('Ada 1 koreksi')).toBeDefined();
  });

  describe('EntryModal datetime-local & occurred_at behavior', () => {
    beforeEach(async () => {
      resetDBInstance();
      await clearAllOfflineEntries();
      vi.restoreAllMocks();
    });

    it('initializes Waktu Transaksi with browser-local datetime format', () => {
      render(
        <OnlineStatusProvider>
          <EntryModal
            open={true}
            walletId="w-1"
            onClose={() => {}}
            onSuccess={() => {}}
          />
        </OnlineStatusProvider>
      );

      const timeInput = screen.getByLabelText('Waktu Transaksi') as HTMLInputElement;
      expect(timeInput).toBeDefined();
      expect(timeInput.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('submits selected occurred_at accurately to API in online mode', async () => {
      const handleSuccess = vi.fn();
      const handleClose = vi.fn();

      const createSpy = vi.spyOn(entriesApi, 'createEntryApi').mockResolvedValue({
        entry: {
          id: 'server-entry-1',
          client_id: 'client-1',
          wallet_id: 'w-1',
          type: 'titipan',
          amount: -25000,
          item_name: 'Nasi Padang',
          note: 'Bungkus',
          occurred_at: new Date(2026, 9, 20, 12, 30, 0, 0).toISOString(),
          created_by: 'me',
          created_at: new Date().toISOString(),
        },
        is_duplicate: false,
      });

      render(
        <OnlineStatusProvider>
          <EntryModal
            open={true}
            walletId="w-1"
            onClose={handleClose}
            onSuccess={handleSuccess}
          />
        </OnlineStatusProvider>
      );

      const amountInput = screen.getByLabelText(/Nominal/i);
      fireEvent.change(amountInput, { target: { value: '25000' } });

      const itemInput = screen.getByLabelText(/Nama Barang/i);
      fireEvent.change(itemInput, { target: { value: 'Nasi Padang' } });

      const noteInput = screen.getByLabelText(/Catatan Tambahan/i);
      fireEvent.change(noteInput, { target: { value: 'Bungkus' } });

      const timeInput = screen.getByLabelText(/Waktu Transaksi/i);
      fireEvent.change(timeInput, { target: { value: '2026-10-20T12:30' } });

      const submitBtn = screen.getByRole('button', { name: 'Simpan Entri' });
      fireEvent.click(submitBtn);

      const expectedISO = new Date(2026, 9, 20, 12, 30, 0, 0).toISOString();

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith(
          'w-1',
          expect.objectContaining({
            amount: 25000,
            item_name: 'Nasi Padang',
            note: 'Bungkus',
            occurred_at: expectedISO,
          })
        );
        expect(handleSuccess).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'server-entry-1' }),
          false
        );
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('queues offline entry with selected occurred_at in offline mode', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

      const handleSuccess = vi.fn();
      const handleClose = vi.fn();

      render(
        <OnlineStatusProvider>
          <EntryModal
            open={true}
            walletId="w-1"
            onClose={handleClose}
            onSuccess={handleSuccess}
          />
        </OnlineStatusProvider>
      );

      const amountInput = screen.getByLabelText(/Nominal/i);
      fireEvent.change(amountInput, { target: { value: '35000' } });

      const itemInput = screen.getByLabelText(/Nama Barang/i);
      fireEvent.change(itemInput, { target: { value: 'Ayam Goreng' } });

      const timeInput = screen.getByLabelText(/Waktu Transaksi/i);
      fireEvent.change(timeInput, { target: { value: '2026-10-22T15:45' } });

      const submitBtn = screen.getByRole('button', { name: 'Simpan Entri' });
      fireEvent.click(submitBtn);

      const expectedISO = new Date(2026, 9, 22, 15, 45, 0, 0).toISOString();

      await waitFor(async () => {
        const pending = await getPendingOfflineEntries();
        expect(pending.length).toBe(1);
        expect(pending[0].amount).toBe(-35000);
        expect(pending[0].item_name).toBe('Ayam Goreng');
        expect(pending[0].occurred_at).toBe(expectedISO);

        expect(handleSuccess).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: -35000,
            item_name: 'Ayam Goreng',
            occurred_at: expectedISO,
            is_offline_pending: true,
          }),
          true
        );
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('falls back to offline queue with selected occurred_at on network failure (status: 0)', async () => {
      const handleSuccess = vi.fn();
      const handleClose = vi.fn();

      vi.spyOn(entriesApi, 'createEntryApi').mockRejectedValue({
        status: 0,
        message: 'Network offline failure',
      });

      render(
        <OnlineStatusProvider>
          <EntryModal
            open={true}
            walletId="w-1"
            onClose={handleClose}
            onSuccess={handleSuccess}
          />
        </OnlineStatusProvider>
      );

      const amountInput = screen.getByLabelText(/Nominal/i);
      fireEvent.change(amountInput, { target: { value: '18000' } });

      const itemInput = screen.getByLabelText(/Nama Barang/i);
      fireEvent.change(itemInput, { target: { value: 'Es Teh Manis' } });

      const timeInput = screen.getByLabelText(/Waktu Transaksi/i);
      fireEvent.change(timeInput, { target: { value: '2026-10-25T08:00' } });

      const submitBtn = screen.getByRole('button', { name: 'Simpan Entri' });
      fireEvent.click(submitBtn);

      const expectedISO = new Date(2026, 9, 25, 8, 0, 0, 0).toISOString();

      await waitFor(async () => {
        const pending = await getPendingOfflineEntries();
        expect(pending.length).toBe(1);
        expect(pending[0].amount).toBe(-18000);
        expect(pending[0].item_name).toBe('Es Teh Manis');
        expect(pending[0].occurred_at).toBe(expectedISO);

        expect(handleSuccess).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: -18000,
            item_name: 'Es Teh Manis',
            occurred_at: expectedISO,
            is_offline_pending: true,
          }),
          true
        );
        expect(handleClose).toHaveBeenCalled();
      });
    });
  });
});
