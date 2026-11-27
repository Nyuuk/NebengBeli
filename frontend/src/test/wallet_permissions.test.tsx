import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material';
import { appTheme } from '../theme';
import { WalletDetailPage } from '../pages/WalletDetailPage';
import { AdminPage } from '../pages/AdminPage';
import { StatementView } from '../components/StatementView';
import { MoveEntryModal } from '../components/MoveEntryModal';
import { ShoppingSessionModal } from '../components/ShoppingSessionModal';
import * as entriesApi from '../api/entries';
import * as statements from '../api/statements';
import * as admin from '../api/admin';
import * as walletsApi from '../api/wallets';
import * as db from '../offline/db';
import { Entry, User, Wallet } from '../types';

const state = vi.hoisted(() => ({ user: { id: 'reader', username: 'reader', role: 'user', created_at: '' } as User, mobile: false }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../context/OnlineStatusContext', () => ({ useOnlineStatus: () => ({ isOnline: true, refreshPendingCount: vi.fn(), triggerSync: vi.fn() }) }));
vi.mock('../components/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@mui/material', async (original) => ({ ...await original<typeof import('@mui/material')>(), useMediaQuery: () => state.mobile }));

const wallet: Wallet = { id: 'w1', name: 'Shared wallet', creator_id: 'creator', owner_id: 'reader', owner_username: 'reader', user_role: 'owner', balance: 100, entry_count: 2, is_archived: false, created_at: '' };
const entry: Entry = { id: 'e1', client_id: 'c1', wallet_id: 'w1', type: 'titipan', amount: -10, item_name: 'Lunch', note: '', occurred_at: '2026-01-01', created_at: '2026-01-01', created_by: 'creator' };
const failed: Entry = { ...entry, id: 'failed', client_id: 'failed', item_name: 'Failed lunch', is_offline_failed: true };

function renderDetail(path = '/wallets/w1') {
  return render(<ThemeProvider theme={appTheme}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/wallets/:id" element={<WalletDetailPage />} />
    <Route path="/admin/wallets/:id" element={<WalletDetailPage />} />
    <Route path="/admin" element={<div>Admin destination</div>} />
  </Routes></MemoryRouter></ThemeProvider>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  state.user = { id: 'reader', username: 'reader', role: 'user', created_at: '' };
  state.mobile = false;
  vi.spyOn(db, 'getPendingOfflineEntriesByWallet').mockResolvedValue([]);
  vi.spyOn(db, 'setCachedStatement').mockResolvedValue(undefined);
  vi.spyOn(statements, 'getStatementApi').mockResolvedValue({ wallet, entries: [entry, failed], total: 2, page: 1, page_size: 50, summary: { current_balance: 100, entry_count: 2, total_titipan: -10, total_topup: 110, total_koreksi: 0 } });
});

function expectNoMutations() {
  for (const name of [/Catat Transaksi/, /Tautkan/, /Putus Tautan/, /Koreksi Entri/, /Pindah ke Buku/, /Coba Sinkronkan/, /Pindahkan ke Buku/, /Buang/]) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
  }
  expect(screen.queryByText('Aksi')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
}

describe('Wallet detail permissions', () => {
  it.each([false, true])('owner remains read-only (mobile=%s), including menu and failed entries', async (mobile) => {
    state.mobile = mobile;
    renderDetail();
    await screen.findByRole('heading', { name: wallet.name });
    expectNoMutations();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    expect(screen.getByText('Failed lunch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rekap Teks' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.getByLabelText('Baris per halaman')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Menu buku' }));
    expect(screen.getByRole('menuitem', { name: /Unduh CSV/ })).toBeInTheDocument();
    for (const name of [/Ganti Nama/, /Tautkan/, /Putus Tautan/, /Arsip/]) {
      expect(screen.queryByRole('menuitem', { name })).not.toBeInTheDocument();
    }
  });

  it('missing user_role never implies creator', async () => {
    vi.mocked(statements.getStatementApi).mockResolvedValueOnce({ ...(await statements.getStatementApi('w1')), wallet: { ...wallet, user_role: undefined } });
    renderDetail();
    await screen.findByRole('heading', { name: wallet.name });
    expectNoMutations();
  });

  it.each([
    { owner_username: 'reader', is_archived: false, link: /Putus Tautan Rekan/, archive: /Arsipkan Buku/ },
    { owner_username: undefined, is_archived: false, link: /Tautkan ke Rekan/, archive: /Arsipkan Buku/ },
    { owner_username: 'reader', is_archived: true, link: /Putus Tautan Rekan/, archive: /Batalkan Arsip/ },
  ])('admin can manage another creator wallet: %o', async (variant) => {
    state.user = { ...state.user, role: 'admin' };
    vi.mocked(statements.getStatementApi).mockResolvedValueOnce({ ...(await statements.getStatementApi('w1')), wallet: { ...wallet, ...variant } });
    renderDetail('/admin/wallets/w1');
    await screen.findByRole('heading', { name: wallet.name });
    expect(screen.getByRole('button', { name: 'Rekap Teks' })).toBeInTheDocument();
    if (!variant.is_archived) {
      expect(screen.getByRole('button', { name: 'Catat Transaksi' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Koreksi Entri' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pindah ke Buku Lain' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Catat Transaksi' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
    fireEvent.click(screen.getByRole('button', { name: 'Menu buku' }));
    expect(screen.getByRole('menuitem', { name: variant.link })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: variant.archive })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Ganti Nama Buku/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(screen.getByText('Admin destination')).toBeInTheDocument();
  });
});

describe('Statement explicit permission gate', () => {
  it.each([false, true])('hides every action even with mutation callbacks supplied (mobile=%s)', (mobile) => {
    state.mobile = mobile;
    const mutate = vi.fn();
    render(<StatementView entries={[entry, failed]} totalCount={2} page={1} pageSize={50} onPageChange={vi.fn()} canManage={false}
      onCorrectEntry={mutate} onMoveEntry={mutate} onDiscardFailedEntry={mutate} onMoveFailedEntry={mutate} onRetryFailedEntry={mutate} />);
    expectNoMutations();
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('Shopping restored wallet permissions', () => {
  it.each([
    { ...wallet, user_role: undefined },
    { ...wallet },
    { ...wallet, creator_id: 'reader', user_role: 'creator' as const, is_archived: true },
  ])('rejects restored rows without active creator permission: %o', async (target) => {
    vi.spyOn(db, 'getShoppingDraft').mockResolvedValue({
      rows: [{ rowId: 'restored', wallet_id: 'w1', item_name: 'Restored lunch', amount_str: '10', amount: 10, note: '' }],
      occurred_at: '2026-01-01T12:00', saved_at: '',
    });
    vi.spyOn(db, 'saveShoppingDraft').mockResolvedValue(undefined);
    vi.spyOn(walletsApi, 'getItemSuggestionsApi').mockResolvedValue([]);
    vi.spyOn(db, 'setCachedSuggestions').mockResolvedValue(undefined);
    const batch = vi.spyOn(entriesApi, 'batchCreateEntriesApi');
    const queue = vi.spyOn(db, 'queueOfflineEntry');
    render(<ShoppingSessionModal open wallets={[target]} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await screen.findByDisplayValue('Restored lunch');
    fireEvent.click(screen.getByRole('button', { name: /Simpan Semua/ }));
    expect(await screen.findByText(/Buku titipan tidak lagi aktif/)).toBeInTheDocument();
    expect(batch).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });
});

describe('Admin wallet navigation and move targets', () => {
  it('Admin → Wallets → Detail → Back restores Wallets tab', async () => {
    state.user = { ...state.user, role: 'admin' };
    vi.spyOn(admin, 'adminGetStatsApi').mockResolvedValue({ stats: { total_users: 0, total_wallets: 1, active_wallets: 1, archived_wallets: 0, total_entries: 0, total_volume: 0, total_audit_logs: 0 } });
    vi.spyOn(admin, 'adminListUsersApi').mockResolvedValue({ users: [], total: 0 });
    vi.spyOn(admin, 'adminListWalletsApi').mockResolvedValue({ wallets: [wallet], total: 1 });
    render(<ThemeProvider theme={appTheme}><MemoryRouter initialEntries={['/admin']}><Routes>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin/wallets/:id" element={<WalletDetailPage />} />
    </Routes></MemoryRouter></ThemeProvider>);
    fireEvent.click(screen.getByRole('tab', { name: /Semua Buku/ }));
    expect(await screen.findByRole('link', { name: 'Detail' })).toHaveAttribute('href', '/admin/wallets/w1');
    expect(screen.getByRole('columnheader', { name: 'Aksi' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Detail' }));
    await screen.findByRole('heading', { name: wallet.name });
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(screen.getByRole('tab', { name: /Semua Buku/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: 'Detail' })).toBeInTheDocument();
  });

  it.each([false, true])('admin loads >200 destinations across pages (failed=%s)', async (failedMove) => {
    state.user = { ...state.user, role: 'admin' };
    const firstPage = Array.from({ length: 200 }, (_, i) => ({ ...wallet, id: `page1-${i}`, is_archived: true }));
    const targets = vi.spyOn(admin, 'adminListWalletsApi').mockImplementation(async (_limit, offset) => ({
      wallets: offset === 0 ? firstPage : [{ ...wallet, id: 'last', name: 'Page two destination' }], total: 201,
    }));
    if (failedMove) {
      renderDetail('/admin/wallets/w1');
      fireEvent.click(await screen.findByRole('button', { name: 'Pindahkan ke Buku Lain' }));
    } else {
      render(<MoveEntryModal open sourceWalletId="w1" targetEntry={entry} onClose={vi.fn()} onSuccess={vi.fn()} />);
    }
    await waitFor(() => expect(targets).toHaveBeenCalledWith(200, 200));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Buku|Wallet/i })).toHaveTextContent('Page two destination'));
  });

  it.each([false, true])('non-admin destinations fail closed for missing role and owner (failed=%s)', async (failedMove) => {
    state.user = { ...state.user, id: 'creator' };
    vi.spyOn(walletsApi, 'getWalletsApi').mockResolvedValue([
      { ...wallet, id: 'owner', creator_id: 'other', name: 'Owner only' },
      { ...wallet, id: 'missing', creator_id: 'other', user_role: undefined, name: 'Missing role' },
      { ...wallet, id: 'allowed', name: 'Creator target', user_role: undefined },
    ]);
    if (failedMove) {
      renderDetail();
      fireEvent.click(await screen.findByRole('button', { name: 'Pindahkan ke Buku Lain' }));
    } else {
      render(<MoveEntryModal open sourceWalletId="w1" targetEntry={entry} onClose={vi.fn()} onSuccess={vi.fn()} />);
    }
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Buku|Wallet/i })).toHaveTextContent('Creator target'));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Buku|Wallet/i }));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Creator target');
  });

  it('admin loads other creators active wallets, excluding source and archived wallets', async () => {
    state.user = { ...state.user, role: 'admin' };
    const targets = vi.spyOn(admin, 'adminListWalletsApi').mockResolvedValue({ wallets: [wallet, { ...wallet, id: 'target', name: 'Other creator target' }, { ...wallet, id: 'archived', name: 'Archived target', is_archived: true }], total: 3 });
    const own = vi.spyOn(walletsApi, 'getWalletsApi');
    render(<MoveEntryModal open sourceWalletId="w1" targetEntry={entry} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(targets).toHaveBeenCalledWith(200, 0));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Other creator target'));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Other creator target');
    expect(own).not.toHaveBeenCalled();
  });
});
