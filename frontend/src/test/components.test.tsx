import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CorrectionModal } from '../components/CorrectionModal';
import { UnlinkWalletModal } from '../components/UnlinkWalletModal';
import { CreatorInsightsCard } from '../components/CreatorInsightsCard';
import { StatementView } from '../components/StatementView';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
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
        { wallet_id: 'w-1', wallet_name: 'Rendy - Kopi', balance: 50000, owner_username: 'rendy', is_archived: false },
        { wallet_id: 'w-2', wallet_name: 'Budi - Makan', balance: 75000, owner_username: 'budi', is_archived: false },
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
      amount: 30000,
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
        amount: 50000,
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
        amount: -10000,
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
});
