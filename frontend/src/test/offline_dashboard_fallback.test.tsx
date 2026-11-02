import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
import { DashboardPage } from '../pages/DashboardPage';
import { WalletDetailPage } from '../pages/WalletDetailPage';
import * as authApi from '../api/auth';
import * as walletsApi from '../api/wallets';
import * as statementsApi from '../api/statements';
import * as linkRequestsApi from '../api/linkRequests';
import { ApiError } from '../api/client';
import {
  setCachedUser,
  setCachedWallets,
  getCachedWallets,
  setCachedStatement,
  getCachedStatement,
  resetDBInstance,
  clearAllOfflineEntries,
  setCurrentUserId,
} from '../offline/db';
import { User, Wallet, StatementResponse } from '../types';

const mockUser: User = {
  id: 'usr-adnan-123',
  username: 'adnantesting123',
  role: 'user',
  created_at: '2026-02-22T10:00:00Z',
};

const mockWallets: Wallet[] = [
  {
    id: 'w-managed-1',
    name: 'Dompet Kopi Adnan',
    creator_id: 'usr-adnan-123',
    creator_username: 'adnantesting123',
    owner_id: 'usr-budi-456',
    owner_username: 'budi',
    balance: -25000,
    entry_count: 5,
    is_archived: false,
    user_role: 'creator',
    created_at: new Date().toISOString(),
  },
  {
    id: 'w-owned-2',
    name: 'Dompet Titipan Siang',
    creator_id: 'usr-rendy-789',
    creator_username: 'rendy',
    owner_id: 'usr-adnan-123',
    owner_username: 'adnantesting123',
    balance: 50000,
    entry_count: 3,
    is_archived: false,
    user_role: 'owner',
    created_at: new Date().toISOString(),
  },
];

const mockStatement: StatementResponse = {
  wallet: mockWallets[0],
  summary: {
    total_titipan: 25000,
    total_topup: 0,
    total_koreksi: 0,
    current_balance: -25000,
    entry_count: 5,
  },
  entries: [
    {
      id: 'e-1',
      client_id: 'c-1',
      wallet_id: 'w-managed-1',
      type: 'titipan',
      amount: -25000,
      item_name: 'Es Kopi Susu',
      note: '',
      occurred_at: new Date().toISOString(),
      created_by: 'usr-adnan-123',
      created_at: new Date().toISOString(),
    },
  ],
  total: 1,
  page: 1,
  page_size: 50,
};

const renderWithProviders = (element: React.ReactNode, initialEntries = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <OnlineStatusProvider>
          {element}
        </OnlineStatusProvider>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('Offline Dashboard & Wallet Fallback when Backend Returns 503 / Offline', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    resetDBInstance();
    await clearAllOfflineEntries();
    setCurrentUserId('usr-adnan-123');
    await setCachedUser(mockUser);

    // Mock getMeApi to succeed with mockUser by default
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });
    vi.spyOn(linkRequestsApi, 'listLinkRequestsApi').mockResolvedValue([]);
  });

  it('persists wallets to IndexedDB when getWalletsApi succeeds online', async () => {
    vi.spyOn(walletsApi, 'getWalletsApi').mockResolvedValue(mockWallets);
    vi.spyOn(walletsApi, 'getCreatorInsightsApi').mockResolvedValue({
      total_money_outside: 25000,
      active_wallets_count: 1,
      total_wallets_count: 2,
      total_titipan_volume: 25000,
      total_titipan_count: 5,
      daily_trends: [],
      weekly_trends: [],
      monthly_trends: [],
      wallet_balances: [],
    });

    renderWithProviders(
      <Routes>
        <Route path="/" element={<DashboardPage />} />
      </Routes>
    );

    // Wait for wallets to render
    await waitFor(() => {
      expect(screen.getByText('Dompet Kopi Adnan')).toBeDefined();
    }, { timeout: 3000 });

    // Check that cache now contains both wallets scoped by user
    const cached = await getCachedWallets('all', 'usr-adnan-123');
    expect(cached).not.toBeNull();
    expect(cached?.wallets).toHaveLength(2);
    expect(cached?.wallets[0].name).toBe('Dompet Kopi Adnan');
  });

  it('falls back to cached wallets in IndexedDB when backend returns HTTP 503 on dashboard load', async () => {
    // 1. Seed cached wallets in IndexedDB
    await setCachedWallets(mockWallets, 'all', 'usr-adnan-123');

    // 2. Simulate backend dead / HTTP 503 on all dashboard APIs
    vi.spyOn(walletsApi, 'getWalletsApi').mockRejectedValue(
      new ApiError('HTTP error 503', 503)
    );
    vi.spyOn(linkRequestsApi, 'listLinkRequestsApi').mockRejectedValue(
      new ApiError('HTTP error 503', 503)
    );
    vi.spyOn(walletsApi, 'getCreatorInsightsApi').mockRejectedValue(
      new ApiError('HTTP error 503', 503)
    );

    renderWithProviders(
      <Routes>
        <Route path="/" element={<DashboardPage />} />
      </Routes>
    );

    // 3. Wallets MUST still render from cache and not be empty!
    await waitFor(() => {
      expect(screen.getByText('Dompet Kopi Adnan')).toBeDefined();
    });

    expect(screen.getByText(/Dompet Saya Kelola/i)).toBeDefined();

    // 4. Cache must NOT be overwritten with an empty array!
    const cachedAfter503 = await getCachedWallets('all', 'usr-adnan-123');
    expect(cachedAfter503).not.toBeNull();
    expect(cachedAfter503?.wallets).toHaveLength(2);
    expect(cachedAfter503?.wallets[0].name).toBe('Dompet Kopi Adnan');
  });

  it('falls back to cached wallets when network connection error (status 0) occurs', async () => {
    await setCachedWallets(mockWallets, 'all', 'usr-adnan-123');

    vi.spyOn(walletsApi, 'getWalletsApi').mockRejectedValue(
      new ApiError('Network connection error', 0)
    );

    renderWithProviders(
      <Routes>
        <Route path="/" element={<DashboardPage />} />
      </Routes>
    );

    await waitFor(() => {
      expect(screen.getByText('Dompet Kopi Adnan')).toBeDefined();
    });

    const cached = await getCachedWallets('all', 'usr-adnan-123');
    expect(cached?.wallets).toHaveLength(2);
  });

  it('WalletDetailPage falls back to cached statement when backend returns HTTP 503', async () => {
    // Seed cached statement
    await setCachedStatement('w-managed-1', mockStatement, 'usr-adnan-123');

    // Backend returns 503
    vi.spyOn(statementsApi, 'getStatementApi').mockRejectedValue(
      new ApiError('HTTP error 503', 503)
    );

    renderWithProviders(
      <Routes>
        <Route path="/wallets/:id" element={<WalletDetailPage />} />
      </Routes>,
      ['/wallets/w-managed-1']
    );

    // Should render wallet details from cached statement
    await waitFor(() => {
      expect(screen.getByText('Dompet Kopi Adnan')).toBeDefined();
    });
    expect(screen.getByText('Es Kopi Susu')).toBeDefined();

    // Verify cache remains intact
    const cached = await getCachedStatement('w-managed-1', 'usr-adnan-123');
    expect(cached?.data.wallet.name).toBe('Dompet Kopi Adnan');
  });

  it('WalletDetailPage falls back to cached wallet info if statement is not yet cached', async () => {
    // Seed wallet list cache only (e.g. statement not visited yet)
    await setCachedWallets(mockWallets, 'all', 'usr-adnan-123');

    // Backend returns 503
    vi.spyOn(statementsApi, 'getStatementApi').mockRejectedValue(
      new ApiError('HTTP error 503', 503)
    );

    renderWithProviders(
      <Routes>
        <Route path="/wallets/:id" element={<WalletDetailPage />} />
      </Routes>,
      ['/wallets/w-managed-1']
    );

    // Should display wallet name from cached wallets list
    await waitFor(() => {
      expect(screen.getByText('Dompet Kopi Adnan')).toBeDefined();
    });
  });
});
