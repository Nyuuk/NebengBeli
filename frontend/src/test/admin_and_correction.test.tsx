import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CorrectionModal } from '../components/CorrectionModal';
import { AdminPage } from '../pages/AdminPage';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
import { AuthProvider } from '../context/AuthContext';
import * as entriesApi from '../api/entries';
import * as adminApi from '../api/admin';
import * as clientModule from '../api/client';
import { syncOfflineQueue } from '../offline/sync';
import {
  queueOfflineEntry,
  clearAllOfflineEntries,
  getPendingOfflineEntries,
  resetDBInstance,
} from '../offline/db';
import { Entry, PendingOfflineEntry } from '../types';

describe('Correction Serialization and Offline Contract Alignment', () => {
  beforeEach(async () => {
    resetDBInstance();
    await clearAllOfflineEntries();
    vi.restoreAllMocks();
  });

  const baseEntry: Entry = {
    id: 'e-orig-1',
    client_id: 'c-orig-1',
    wallet_id: 'w-1',
    type: 'titipan',
    amount: -50000,
    item_name: 'Nasi Padang Komplit',
    note: 'Rendang',
    occurred_at: '2026-09-30T00:00:00Z',
    created_by: 'creator-1',
    created_at: '2026-09-30T00:00:00Z',
    effective_amount: -50000,
  };

  it('serializes target_amount, final_nominal, and amount with final nominal semantics (online)', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const createSpy = vi.spyOn(entriesApi, 'createEntryApi').mockResolvedValue({
      entry: {
        ...baseEntry,
        id: 'corr-id-1',
        type: 'koreksi',
        amount: 10000, // server returned signed delta
        corrects_entry_id: 'e-orig-1',
        correction_reason: 'Salah Harga',
      },
      is_duplicate: false,
    });

    render(
      <OnlineStatusProvider>
        <CorrectionModal
          open={true}
          walletId="w-1"
          targetEntry={baseEntry}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </OnlineStatusProvider>
    );

    const input = screen.getByPlaceholderText('0') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '40000' } });

    const submitBtn = screen.getByRole('button', { name: 'Simpan Koreksi' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    expect(createSpy).toHaveBeenCalledWith(
      'w-1',
      expect.objectContaining({
        type: 'koreksi',
        amount: 40000,
        target_amount: 40000,
        final_nominal: 40000,
        item_name: 'Nasi Padang Komplit',
        corrects_entry_id: 'e-orig-1',
        correction_reason: 'Salah Harga',
      })
    );
    expect(handleSuccess).toHaveBeenCalled();
  });

  it('serializes cancellation (reversal) with nominal 0 and preserves reason', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const createSpy = vi.spyOn(entriesApi, 'createEntryApi').mockResolvedValue({
      entry: {
        ...baseEntry,
        id: 'corr-id-cancel',
        type: 'koreksi',
        amount: 50000,
        corrects_entry_id: 'e-orig-1',
        correction_reason: 'Batal',
      },
      is_duplicate: false,
    });

    render(
      <OnlineStatusProvider>
        <CorrectionModal
          open={true}
          walletId="w-1"
          targetEntry={baseEntry}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </OnlineStatusProvider>
    );

    // Click quick reason "Batal"
    const batalBtns = screen.getAllByRole('button', { name: 'Batal' });
    fireEvent.click(batalBtns[0]);

    const input = screen.getByPlaceholderText('0') as HTMLInputElement;
    expect(input.value).toBe('0');

    const submitBtn = screen.getByRole('button', { name: 'Simpan Koreksi' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    expect(createSpy).toHaveBeenCalledWith(
      'w-1',
      expect.objectContaining({
        type: 'koreksi',
        amount: 0,
        target_amount: 0,
        final_nominal: 0,
        corrects_entry_id: 'e-orig-1',
        correction_reason: 'Batal',
      })
    );
  });

  it('validates and blocks submission when delta is zero', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    const createSpy = vi.spyOn(entriesApi, 'createEntryApi');

    render(
      <OnlineStatusProvider>
        <CorrectionModal
          open={true}
          walletId="w-1"
          targetEntry={baseEntry}
          onClose={handleClose}
          onSuccess={handleSuccess}
        />
      </OnlineStatusProvider>
    );

    // Initial value is 50000 (delta = 0)
    const submitBtn = screen.getByRole('button', { name: 'Simpan Koreksi' }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('queues offline correction with target_amount and replaying sends target_amount semantics', async () => {
    const offlineItem: PendingOfflineEntry = {
      client_id: 'off-corr-1',
      wallet_id: 'w-1',
      type: 'koreksi',
      amount: 15000, // local delta for ledger view
      target_amount: 35000,
      final_nominal: 35000,
      item_name: 'Nasi Padang Komplit',
      note: 'Koreksi: Salah Harga',
      corrects_entry_id: 'e-orig-1',
      correction_reason: 'Salah Harga',
      occurred_at: '2026-09-30T00:00:00Z',
      created_at: '2026-09-30T00:00:00Z',
      retry_count: 0,
      status: 'pending',
    };

    await queueOfflineEntry(offlineItem);
    const pending = await getPendingOfflineEntries();
    expect(pending.length).toBe(1);
    expect(pending[0].target_amount).toBe(35000);

    const createSpy = vi.spyOn(entriesApi, 'createEntryApi').mockResolvedValue({
      entry: {
        ...baseEntry,
        id: 'server-corr-1',
        type: 'koreksi',
        amount: 15000,
      },
      is_duplicate: false,
    });

    const syncResult = await syncOfflineQueue();
    expect(syncResult.synced).toBe(1);
    expect(createSpy).toHaveBeenCalledWith(
      'w-1',
      expect.objectContaining({
        type: 'koreksi',
        amount: 35000,
        target_amount: 35000,
        final_nominal: 35000,
        corrects_entry_id: 'e-orig-1',
      })
    );
  });
});

describe('Typed Admin API Adapters & Malformed Response Rejection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('adminGetStatsApi: succeeds on valid payload and rejects malformed payload', async () => {
    const validStats = {
      stats: {
        total_users: 10,
        total_wallets: 5,
        active_wallets: 4,
        archived_wallets: 1,
        total_entries: 42,
        total_volume: 1500000,
        total_audit_logs: 88,
      },
    };

    const requestSpy = vi.spyOn(clientModule, 'request').mockResolvedValueOnce(validStats);
    const res = await adminApi.adminGetStatsApi();
    expect(res.stats.total_users).toBe(10);
    expect(requestSpy).toHaveBeenCalledWith('/api/admin/stats');

    // Malformed: stats is missing
    vi.spyOn(clientModule, 'request').mockResolvedValueOnce({ invalid: true });
    await expect(adminApi.adminGetStatsApi()).rejects.toThrow(/Malformed stats response/i);
  });

  it('adminGetTrendsApi: succeeds on valid trends and rejects malformed payload', async () => {
    const validTrends = {
      trends: {
        daily: [{ label: '2026-09-29', count: 3, total_amount: 50000 }],
        weekly: [{ label: '2026-W39', count: 12, total_amount: 250000 }],
        monthly: [{ label: '2026-09', count: 45, total_amount: 1000000 }],
      },
    };

    vi.spyOn(clientModule, 'request').mockResolvedValueOnce(validTrends);
    const res = await adminApi.adminGetTrendsApi();
    expect(res.trends.daily.length).toBe(1);
    expect(res.trends.weekly.length).toBe(1);

    // Malformed: trends.daily is not an array
    vi.spyOn(clientModule, 'request').mockResolvedValueOnce({
      trends: { daily: 'not an array', weekly: [], monthly: [] },
    });
    await expect(adminApi.adminGetTrendsApi()).rejects.toThrow(/Malformed trends response/i);
  });

  it('adminListEntriesApi: succeeds on valid entries and rejects malformed payload', async () => {
    const validEntries = {
      entries: [
        {
          id: 'ent-1',
          client_id: 'c-1',
          wallet_id: 'w-1',
          type: 'titipan' as const,
          amount: 25000,
          item_name: 'Es Kopi',
          note: '',
          occurred_at: '2026-09-30T00:00:00Z',
          created_by: 'u-1',
          created_at: '2026-09-30T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        total_titipan_count: 1,
        total_titipan_amount: 25000,
        total_topup_count: 0,
        total_topup_amount: 0,
        total_koreksi_count: 0,
        total_koreksi_amount: 0,
        total_count: 1,
        total_volume: 25000,
        net_balance: 25000,
      },
    };

    vi.spyOn(clientModule, 'request').mockResolvedValueOnce(validEntries);
    const res = await adminApi.adminListEntriesApi({ limit: 50, offset: 0 });
    expect(res.entries.length).toBe(1);
    expect(res.summary?.total_titipan_amount).toBe(25000);

    // Malformed: entries is missing
    vi.spyOn(clientModule, 'request').mockResolvedValueOnce({ total: 10 });
    await expect(adminApi.adminListEntriesApi()).rejects.toThrow(/Malformed entries response/i);
  });

  it('adminGetSummaryApi: succeeds on valid summary and rejects malformed payload', async () => {
    const validSummary = {
      total_count: 5,
      summary: {
        total_titipan_count: 3,
        total_titipan_amount: 75000,
        total_topup_count: 1,
        total_topup_amount: -50000,
        total_koreksi_count: 1,
        total_koreksi_amount: -5000,
        total_count: 5,
        total_volume: 130000,
        net_balance: 20000,
      },
    };

    vi.spyOn(clientModule, 'request').mockResolvedValueOnce(validSummary);
    const res = await adminApi.adminGetSummaryApi({ period: 'today' });
    expect(res.total_count).toBe(5);
    expect(res.summary.net_balance).toBe(20000);

    // Malformed: summary is not an object
    vi.spyOn(clientModule, 'request').mockResolvedValueOnce({ summary: 'invalid' });
    await expect(adminApi.adminGetSummaryApi()).rejects.toThrow(/Malformed summary response/i);
  });

  it('adminListCreatorsApi: succeeds on valid creators and rejects malformed payload', async () => {
    const validCreators = {
      creators: [
        {
          creator_id: 'cr-1',
          username: 'rahmat',
          total_wallets: 3,
          active_wallets: 2,
          archived_wallets: 1,
          total_titipan_count: 10,
          total_titipan_amount: 300000,
          total_topup_count: 4,
          total_topup_amount: -200000,
          total_koreksi_count: 1,
          total_koreksi_amount: -10000,
          total_outstanding: 90000,
        },
      ],
      total: 1,
    };

    vi.spyOn(clientModule, 'request').mockResolvedValueOnce(validCreators);
    const res = await adminApi.adminListCreatorsApi();
    expect(res.creators.length).toBe(1);
    expect(res.creators[0].username).toBe('rahmat');

    // Malformed: creators is missing
    vi.spyOn(clientModule, 'request').mockResolvedValueOnce({ total: 1 });
    await expect(adminApi.adminListCreatorsApi()).rejects.toThrow(/Malformed creators response/i);
  });
});

describe('AdminPage Live Data Presentation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders stats, entries, creators, and trends live data across tabs', async () => {
    vi.spyOn(adminApi, 'adminGetStatsApi').mockResolvedValue({
      stats: {
        total_users: 15,
        total_wallets: 8,
        active_wallets: 7,
        archived_wallets: 1,
        total_entries: 60,
        total_volume: 3200000,
        total_audit_logs: 120,
      },
    });

    vi.spyOn(adminApi, 'adminListUsersApi').mockResolvedValue({
      users: [
        { id: 'u-1', username: 'admin_master', role: 'admin', created_at: new Date().toISOString() },
        { id: 'u-2', username: 'budi_creator', role: 'user', created_at: new Date().toISOString() },
      ],
      total: 2,
    });

    vi.spyOn(adminApi, 'adminListWalletsApi').mockResolvedValue({
      wallets: [
        {
          id: 'w-1',
          name: 'Dompet Makan Kantor',
          creator_id: 'u-2',
          creator_username: 'budi_creator',
          balance: 150000,
          entry_count: 12,
          is_archived: false,
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    vi.spyOn(adminApi, 'adminListEntriesApi').mockResolvedValue({
      entries: [
        {
          id: 'ent-1',
          client_id: 'c-1',
          wallet_id: 'w-1',
          wallet_name: 'Dompet Makan Kantor',
          created_by_username: 'budi_creator',
          type: 'titipan',
          amount: 45000,
          item_name: 'Ayam Goreng Sambal',
          note: '',
          occurred_at: new Date().toISOString(),
          created_by: 'u-2',
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
      summary: {
        total_titipan_count: 1,
        total_titipan_amount: 45000,
        total_topup_count: 0,
        total_topup_amount: 0,
        total_koreksi_count: 0,
        total_koreksi_amount: 0,
        total_count: 1,
        total_volume: 45000,
        net_balance: 45000,
      },
    });

    vi.spyOn(adminApi, 'adminGetSummaryApi').mockResolvedValue({
      total_count: 1,
      summary: {
        total_titipan_count: 1,
        total_titipan_amount: 45000,
        total_topup_count: 0,
        total_topup_amount: 0,
        total_koreksi_count: 0,
        total_koreksi_amount: 0,
        total_count: 1,
        total_volume: 45000,
        net_balance: 45000,
      },
    });

    vi.spyOn(adminApi, 'adminListCreatorsApi').mockResolvedValue({
      creators: [
        {
          creator_id: 'u-2',
          username: 'budi_creator',
          total_wallets: 2,
          active_wallets: 2,
          archived_wallets: 0,
          total_titipan_count: 8,
          total_titipan_amount: 250000,
          total_topup_count: 3,
          total_topup_amount: -100000,
          total_koreksi_count: 1,
          total_koreksi_amount: -10000,
          total_outstanding: 140000,
        },
      ],
      total: 1,
    });

    vi.spyOn(adminApi, 'adminGetTrendsApi').mockResolvedValue({
      trends: {
        daily: [{ label: '2026-09-30', count: 5, total_amount: 150000 }],
        weekly: [{ label: '2026-W39', count: 20, total_amount: 800000 }],
        monthly: [{ label: '2026-09', count: 60, total_amount: 3200000 }],
      },
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <OnlineStatusProvider>
            <AdminPage />
          </OnlineStatusProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    // Verify stats header
    await waitFor(() => {
      expect(screen.getByText('Admin & System Control Panel')).toBeDefined();
    });

    expect(screen.getByText('admin_master')).toBeDefined();
    expect(screen.getByText('budi_creator')).toBeDefined();

    // Switch to Wallets tab (index 1)
    const walletsTab = screen.getByRole('tab', { name: /Semua Buku/i });
    fireEvent.click(walletsTab);

    await waitFor(() => {
      expect(screen.getByText('Dompet Makan Kantor')).toBeDefined();
    });

    // Switch to Entries tab (index 2)
    const entriesTab = screen.getByRole('tab', { name: /Semua Transaksi/i });
    fireEvent.click(entriesTab);

    await waitFor(() => {
      expect(screen.getByText('Ayam Goreng Sambal')).toBeDefined();
    });

    // Switch to Creators tab (index 3)
    const creatorsTab = screen.getByRole('tab', { name: /Rekap Pembuat/i });
    fireEvent.click(creatorsTab);

    await waitFor(() => {
      expect(screen.getByText('Total Piutang (Outstanding)')).toBeDefined();
    });

    // Switch to Trends tab (index 4)
    const trendsTab = screen.getByRole('tab', { name: /Tren Sistem/i });
    fireEvent.click(trendsTab);

    await waitFor(() => {
      expect(screen.getByText('2026-09-30')).toBeDefined();
    });
  });
});
