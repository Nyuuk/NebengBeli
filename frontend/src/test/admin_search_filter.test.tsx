import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AdminPage } from '../pages/AdminPage';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
import { AuthProvider } from '../context/AuthContext';
import * as adminApi from '../api/admin';
import * as clientModule from '../api/client';

describe('Admin API Search & Filter Query Parameters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('adminListUsersApi sends search and role only when provided', async () => {
    const requestSpy = vi.spyOn(clientModule, 'request').mockResolvedValue({ users: [], total: 0 });

    await adminApi.adminListUsersApi(25, 50);
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/users?limit=25&offset=50');

    await adminApi.adminListUsersApi(25, 0, { search: '  budi  ', role: 'admin' });
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/users?limit=25&offset=0&search=budi&role=admin');

    await adminApi.adminListUsersApi(50, 0, { search: '   ' });
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/users?limit=50&offset=0');
  });

  it('adminListWalletsApi sends search, status, and linked only when provided', async () => {
    const requestSpy = vi.spyOn(clientModule, 'request').mockResolvedValue({ wallets: [], total: 0 });

    await adminApi.adminListWalletsApi(50, 0);
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/wallets?limit=50&offset=0');

    await adminApi.adminListWalletsApi(50, 0, {
      search: 'kantor',
      status: 'active',
      linked: 'unlinked',
    });
    expect(requestSpy).toHaveBeenLastCalledWith(
      '/api/admin/wallets?limit=50&offset=0&search=kantor&status=active&linked=unlinked'
    );
  });

  it('adminListEntriesApi sends search, type, and period when provided', async () => {
    const requestSpy = vi.spyOn(clientModule, 'request').mockResolvedValue({
      entries: [],
      total: 0,
      page: 1,
      limit: 50,
    });

    await adminApi.adminListEntriesApi({ limit: 50, offset: 0 });
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/entries?limit=50&offset=0');

    await adminApi.adminListEntriesApi({
      limit: 50,
      offset: 0,
      search: 'kopi',
      type: 'titipan',
      period: 'this_week',
    });
    expect(requestSpy).toHaveBeenLastCalledWith(
      '/api/admin/entries?limit=50&offset=0&search=kopi&type=titipan&period=this_week'
    );
  });

  it('adminListCreatorsApi sends search and status when provided and omits query string when empty', async () => {
    const requestSpy = vi.spyOn(clientModule, 'request').mockResolvedValue({ creators: [], total: 0 });

    await adminApi.adminListCreatorsApi();
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/creators');

    await adminApi.adminListCreatorsApi({ search: '   ' });
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/creators');

    await adminApi.adminListCreatorsApi({ search: 'rahmat', status: 'has_outstanding' });
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/creators?search=rahmat&status=has_outstanding');
  });

  it('adminListAuditLogsApi sends search, target_type, and action when provided', async () => {
    const requestSpy = vi.spyOn(clientModule, 'request').mockResolvedValue({ audit_logs: [], total: 0 });

    await adminApi.adminListAuditLogsApi({ limit: 50, offset: 0 });
    expect(requestSpy).toHaveBeenLastCalledWith('/api/admin/audit-logs?limit=50&offset=0');

    await adminApi.adminListAuditLogsApi({
      limit: 50,
      offset: 0,
      search: 'admin',
      target_type: 'wallet',
      action: 'wallet.archive',
    });
    expect(requestSpy).toHaveBeenLastCalledWith(
      '/api/admin/audit-logs?limit=50&offset=0&search=admin&action=wallet.archive&target_type=wallet'
    );
  });
});

describe('AdminPage Search & Filter UI', () => {
  const renderAdminPage = () =>
    render(
      <BrowserRouter>
        <AuthProvider>
          <OnlineStatusProvider>
            <AdminPage />
          </OnlineStatusProvider>
        </AuthProvider>
      </BrowserRouter>
    );

  const selectMuiOption = (labelText: string, optionText: string) => {
    const select = screen.getByLabelText(labelText);
    fireEvent.mouseDown(select);
    const listbox = screen.getByRole('listbox');
    fireEvent.click(within(listbox).getByText(optionText));
  };

  beforeEach(() => {
    window.history.replaceState({}, '', '/admin');
    vi.restoreAllMocks();
    vi.spyOn(adminApi, 'adminGetStatsApi').mockResolvedValue({
      stats: {
        total_users: 60,
        total_wallets: 10,
        active_wallets: 8,
        archived_wallets: 2,
        total_entries: 20,
        total_volume: 500000,
        total_audit_logs: 30,
      },
    });
  });

  it('filters Users tab, resets page to 1, shows filtered empty state, and resets cleanly', async () => {
    const usersSpy = vi.spyOn(adminApi, 'adminListUsersApi').mockImplementation(async (_limit, _offset, filter) => {
      if (filter?.search || filter?.role) {
        return { users: [], total: 0 };
      }
      return {
        users: [{ id: 'u-1', username: 'budi', role: 'user', created_at: new Date().toISOString() }],
        total: 60,
      };
    });

    renderAdminPage();
    await waitFor(() => expect(screen.getByText('budi')).toBeDefined());
    expect(usersSpy).toHaveBeenLastCalledWith(50, 0);

    // Move to page 2 first
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(usersSpy).toHaveBeenLastCalledWith(50, 50));

    // Type search query -> debounced call resets page to 1 (offset 0)
    const searchInput = screen.getByPlaceholderText('Cari username atau ID...');
    fireEvent.change(searchInput, { target: { value: 'tidak_ada' } });

    await waitFor(() => {
      expect(usersSpy).toHaveBeenLastCalledWith(50, 0, { search: 'tidak_ada' });
    });

    await waitFor(() => {
      expect(screen.getByText('Tidak ada data yang cocok dengan pencarian/filter.')).toBeDefined();
    });

    // Select Role filter
    selectMuiOption('Role', 'Admin');
    await waitFor(() => {
      expect(usersSpy).toHaveBeenLastCalledWith(50, 0, { search: 'tidak_ada', role: 'admin' });
    });

    // Click Reset Filter -> restores 2-arg call without filter object
    fireEvent.click(screen.getByRole('button', { name: /Reset Filter/i }));
    await waitFor(() => {
      expect(usersSpy).toHaveBeenLastCalledWith(50, 0);
    });
    expect((searchInput as HTMLInputElement).value).toBe('');
  });

  it('filters Wallets tab by search, status, and linked, then resets', async () => {
    vi.spyOn(adminApi, 'adminListUsersApi').mockResolvedValue({ users: [], total: 0 });
    const walletsSpy = vi.spyOn(adminApi, 'adminListWalletsApi').mockResolvedValue({ wallets: [], total: 0 });

    renderAdminPage();
    fireEvent.click(screen.getByRole('tab', { name: /Semua Buku/i }));
    await waitFor(() => expect(walletsSpy).toHaveBeenLastCalledWith(50, 0));

    const searchInput = screen.getByPlaceholderText('Cari nama buku, pembuat, pemilik...');
    fireEvent.change(searchInput, { target: { value: 'kantor' } });
    await waitFor(() => expect(walletsSpy).toHaveBeenLastCalledWith(50, 0, { search: 'kantor' }));

    selectMuiOption('Status', 'Diarsipkan');
    await waitFor(() =>
      expect(walletsSpy).toHaveBeenLastCalledWith(50, 0, { search: 'kantor', status: 'archived' })
    );

    selectMuiOption('Kepemilikan', 'Belum Terhubung');
    await waitFor(() =>
      expect(walletsSpy).toHaveBeenLastCalledWith(50, 0, {
        search: 'kantor',
        status: 'archived',
        linked: 'unlinked',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /Reset Filter/i }));
    await waitFor(() => expect(walletsSpy).toHaveBeenLastCalledWith(50, 0));
  });

  it('filters Entries tab by search, type, and backend-valid period, then resets', async () => {
    vi.spyOn(adminApi, 'adminListUsersApi').mockResolvedValue({ users: [], total: 0 });
    const entriesSpy = vi.spyOn(adminApi, 'adminListEntriesApi').mockResolvedValue({
      entries: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    vi.spyOn(adminApi, 'adminGetSummaryApi').mockResolvedValue({
      total_count: 0,
      summary: {
        total_titipan_count: 0,
        total_titipan_amount: 0,
        total_topup_count: 0,
        total_topup_amount: 0,
        total_koreksi_count: 0,
        total_koreksi_amount: 0,
        total_count: 0,
        total_volume: 0,
        net_balance: 0,
      },
    });

    renderAdminPage();
    fireEvent.click(screen.getByRole('tab', { name: /Semua Transaksi/i }));
    await waitFor(() => expect(entriesSpy).toHaveBeenLastCalledWith({ limit: 50, offset: 0 }));

    const searchInput = screen.getByPlaceholderText('Cari item, catatan, buku, pembuat...');
    fireEvent.change(searchInput, { target: { value: 'nasi' } });
    await waitFor(() => expect(entriesSpy).toHaveBeenLastCalledWith({ limit: 50, offset: 0, search: 'nasi' }));

    selectMuiOption('Tipe', 'Titipan');
    await waitFor(() =>
      expect(entriesSpy).toHaveBeenLastCalledWith({ limit: 50, offset: 0, search: 'nasi', type: 'titipan' })
    );

    selectMuiOption('Periode', 'Minggu Ini');
    await waitFor(() =>
      expect(entriesSpy).toHaveBeenLastCalledWith({
        limit: 50,
        offset: 0,
        search: 'nasi',
        type: 'titipan',
        period: 'this_week',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /Reset Filter/i }));
    await waitFor(() => expect(entriesSpy).toHaveBeenLastCalledWith({ limit: 50, offset: 0 }));
  });

  it('filters Creators tab by search and status, then resets', async () => {
    vi.spyOn(adminApi, 'adminListUsersApi').mockResolvedValue({ users: [], total: 0 });
    const creatorsSpy = vi.spyOn(adminApi, 'adminListCreatorsApi').mockResolvedValue({ creators: [], total: 0 });

    renderAdminPage();
    fireEvent.click(screen.getByRole('tab', { name: /Rekap Pembuat/i }));
    await waitFor(() => expect(creatorsSpy).toHaveBeenLastCalledWith());

    const searchInput = screen.getByPlaceholderText('Cari username pembuat...');
    fireEvent.change(searchInput, { target: { value: 'rahmat' } });
    await waitFor(() => expect(creatorsSpy).toHaveBeenLastCalledWith({ search: 'rahmat' }));

    selectMuiOption('Status', 'Punya Piutang');
    await waitFor(() =>
      expect(creatorsSpy).toHaveBeenLastCalledWith({ search: 'rahmat', status: 'has_outstanding' })
    );

    fireEvent.click(screen.getByRole('button', { name: /Reset Filter/i }));
    await waitFor(() => expect(creatorsSpy).toHaveBeenLastCalledWith());
  });

  it('filters Audit Logs tab by search, target_type, and action, then resets', async () => {
    vi.spyOn(adminApi, 'adminListUsersApi').mockResolvedValue({ users: [], total: 0 });
    const auditSpy = vi.spyOn(adminApi, 'adminListAuditLogsApi').mockResolvedValue({ audit_logs: [], total: 0 });

    renderAdminPage();
    fireEvent.click(screen.getByRole('tab', { name: /Audit Logs/i }));
    await waitFor(() => expect(auditSpy).toHaveBeenLastCalledWith({ limit: 50, offset: 0 }));

    const searchInput = screen.getByPlaceholderText('Cari aktor, aksi, target, metadata...');
    fireEvent.change(searchInput, { target: { value: 'promote' } });
    await waitFor(() =>
      expect(auditSpy).toHaveBeenLastCalledWith({ limit: 50, offset: 0, search: 'promote' })
    );

    selectMuiOption('Target Tipe', 'Buku (Wallet)');
    await waitFor(() =>
      expect(auditSpy).toHaveBeenLastCalledWith({
        limit: 50,
        offset: 0,
        search: 'promote',
        target_type: 'wallet',
      })
    );

    selectMuiOption('Aksi', 'wallet.archive');
    await waitFor(() =>
      expect(auditSpy).toHaveBeenLastCalledWith({
        limit: 50,
        offset: 0,
        search: 'promote',
        target_type: 'wallet',
        action: 'wallet.archive',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /Reset Filter/i }));
    await waitFor(() => expect(auditSpy).toHaveBeenLastCalledWith({ limit: 50, offset: 0 }));
  });
});
