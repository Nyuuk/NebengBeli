import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
import { DashboardPage } from '../pages/DashboardPage';
import * as authApi from '../api/auth';
import * as walletsApi from '../api/wallets';
import * as linkRequestsApi from '../api/linkRequests';
import {
  setCachedUser,
  resetDBInstance,
  clearAllOfflineEntries,
  setCurrentUserId,
} from '../offline/db';
import { User, Wallet } from '../types';

const mockUser: User = {
  id: 'usr-adnan-123',
  username: 'adnan',
  role: 'user',
  created_at: '2026-02-22T10:00:00Z',
};

const mockWallets: Wallet[] = [
  // Tab 0: Creator wallets
  {
    id: 'w-creator-1',
    name: 'Kopi Pagi',
    creator_id: 'usr-adnan-123',
    creator_username: 'adnan',
    owner_id: 'usr-budi-1',
    owner_username: 'budi_santoso',
    balance: -25000,
    entry_count: 3,
    is_archived: false,
    user_role: 'creator',
    created_at: '2026-02-22T10:00:00Z',
  },
  {
    id: 'w-creator-2',
    name: 'Nasi Padang Siang',
    creator_id: 'usr-adnan-123',
    creator_username: 'adnan',
    owner_id: 'usr-siti-2',
    owner_username: 'siti_rahma',
    balance: -40000,
    entry_count: 2,
    is_archived: false,
    user_role: 'creator',
    created_at: '2026-02-22T11:00:00Z',
  },
  // Tab 1: Owner wallets (two different creators, one creator with 2 wallets)
  {
    id: 'w-owner-1',
    name: 'Titipan Jajan Sore',
    creator_id: 'usr-rendy-3',
    creator_username: 'rendy_ob',
    owner_id: 'usr-adnan-123',
    owner_username: 'adnan',
    balance: -15000,
    entry_count: 1,
    is_archived: false,
    user_role: 'owner',
    created_at: '2026-02-22T12:00:00Z',
  },
  {
    id: 'w-owner-2',
    name: 'Titipan Minuman Dingin',
    creator_id: 'usr-rendy-3',
    creator_username: 'rendy_ob',
    owner_id: 'usr-adnan-123',
    owner_username: 'adnan',
    balance: -10000,
    entry_count: 2,
    is_archived: false,
    user_role: 'owner',
    created_at: '2026-02-22T12:30:00Z',
  },
  {
    id: 'w-owner-3',
    name: 'Titipan Sarapan',
    creator_id: 'usr-dewi-4',
    creator_username: 'dewi_kantin',
    owner_id: 'usr-adnan-123',
    owner_username: 'adnan',
    balance: 30000,
    entry_count: 4,
    is_archived: false,
    user_role: 'owner',
    created_at: '2026-02-22T13:00:00Z',
  },
  // Tab 2: Archived wallet
  {
    id: 'w-archived-1',
    name: 'Arsip Liburan Bali',
    creator_id: 'usr-adnan-123',
    creator_username: 'adnan',
    owner_id: 'usr-eko-5',
    owner_username: 'eko_prasetyo',
    balance: 0,
    entry_count: 6,
    is_archived: true,
    user_role: 'creator',
    created_at: '2026-01-10T10:00:00Z',
  },
];

const renderDashboard = () => {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <OnlineStatusProvider>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </OnlineStatusProvider>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('DashboardPage Wallet Search', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    resetDBInstance();
    await clearAllOfflineEntries();
    setCurrentUserId(mockUser.id);
    await setCachedUser(mockUser);

    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });
    vi.spyOn(walletsApi, 'getWalletsApi').mockResolvedValue(mockWallets);
    vi.spyOn(linkRequestsApi, 'listLinkRequestsApi').mockResolvedValue([]);
    vi.spyOn(walletsApi, 'getCreatorInsightsApi').mockResolvedValue({
      total_money_outside: 65000,
      active_wallets_count: 2,
      total_wallets_count: 6,
      total_titipan_volume: 65000,
      total_titipan_count: 5,
      daily_trends: [],
      weekly_trends: [],
      monthly_trends: [],
      wallet_balances: [],
    });
  });

  it('filters creator wallets in Tab 0 by wallet name and owner username (case-insensitive)', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Kopi Pagi')).toBeDefined();
      expect(screen.getByText('Nasi Padang Siang')).toBeDefined();
    });

    const searchInput = screen.getByLabelText('Cari buku dompet');

    // Search by wallet name (mixed case)
    fireEvent.change(searchInput, { target: { value: 'kOpI' } });
    expect(screen.getByText('Kopi Pagi')).toBeDefined();
    expect(screen.queryByText('Nasi Padang Siang')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Dompet Saya Kelola (1)' })).toBeDefined();

    // Search by owner username
    fireEvent.change(searchInput, { target: { value: 'SITI_RAHMA' } });
    expect(screen.getByText('Nasi Padang Siang')).toBeDefined();
    expect(screen.queryByText('Kopi Pagi')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Dompet Saya Kelola (1)' })).toBeDefined();
  });

  it('filters owner wallets and creator groups accurately in Tab 1', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Kopi Pagi')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Dompet Milik Saya (3)' }));

    expect(screen.getByText('Pembuat: @rendy_ob')).toBeDefined();
    expect(screen.getByText('Pembuat: @dewi_kantin')).toBeDefined();

    const searchInput = screen.getByLabelText('Cari buku dompet');

    // Search by creator username -> hides dewi_kantin group
    fireEvent.change(searchInput, { target: { value: 'rendy_ob' } });
    expect(screen.getByText('Pembuat: @rendy_ob')).toBeDefined();
    expect(screen.queryByText('Pembuat: @dewi_kantin')).toBeNull();
    expect(screen.getByText('Titipan Jajan Sore')).toBeDefined();
    expect(screen.getByText('Titipan Minuman Dingin')).toBeDefined();
    expect(screen.getByText('2 buku titipan dikelola oleh rekan ini')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Dompet Milik Saya (2)' })).toBeDefined();

    // Narrow to single wallet under rendy_ob -> subtotal and count update
    fireEvent.change(searchInput, { target: { value: 'Minuman Dingin' } });
    expect(screen.getByText('Pembuat: @rendy_ob')).toBeDefined();
    expect(screen.queryByText('Titipan Jajan Sore')).toBeNull();
    expect(screen.getByText('Titipan Minuman Dingin')).toBeDefined();
    expect(screen.getByText('1 buku titipan dikelola oleh rekan ini')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Dompet Milik Saya (1)' })).toBeDefined();
  });

  it('updates tab counters across tabs and filters archived wallets in Tab 2', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Kopi Pagi')).toBeDefined();
    });

    const searchInput = screen.getByLabelText('Cari buku dompet');
    fireEvent.change(searchInput, { target: { value: 'Bali' } });

    // Counters show match is in Tab 2 (Diarsipkan)
    expect(screen.getByRole('tab', { name: 'Dompet Saya Kelola (0)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Dompet Milik Saya (0)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Diarsipkan \(1\)/i })).toBeDefined();

    // Switch to Tab 2
    fireEvent.click(screen.getByRole('tab', { name: /Diarsipkan \(1\)/i }));
    expect(screen.getByText('Arsip Liburan Bali')).toBeDefined();
  });

  it('shows search empty state and restores all wallets on Reset Pencarian', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Kopi Pagi')).toBeDefined();
    });

    const searchInput = screen.getByLabelText('Cari buku dompet');
    fireEvent.change(searchInput, { target: { value: 'tidak-ada-xyz' } });

    expect(
      screen.getByText('Tidak ada buku yang cocok dengan pencarian "tidak-ada-xyz".')
    ).toBeDefined();

    // Also verify empty state in Tab 1 and Tab 2
    fireEvent.click(screen.getByRole('tab', { name: 'Dompet Milik Saya (0)' }));
    expect(
      screen.getByText('Tidak ada buku yang cocok dengan pencarian "tidak-ada-xyz".')
    ).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: /Diarsipkan \(0\)/i }));
    expect(
      screen.getByText('Tidak ada buku yang cocok dengan pencarian "tidak-ada-xyz".')
    ).toBeDefined();

    // Click Reset Pencarian
    fireEvent.click(screen.getByRole('button', { name: 'Reset Pencarian' }));

    expect((searchInput as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('tab', { name: 'Dompet Saya Kelola (2)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Dompet Milik Saya (3)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Diarsipkan \(1\)/i })).toBeDefined();
    expect(screen.getByText('Arsip Liburan Bali')).toBeDefined();
  });
});
