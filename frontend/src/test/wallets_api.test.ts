import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCreatorInsightsApi } from '../api/wallets';
import * as client from '../api/client';

describe('Wallets API Adapters and Insights Normalization Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes backend CreatorInsights struct into frontend CreatorInsights model', async () => {
    const backendResponse = {
      total_outstanding: 150000,
      total_active_wallets: 3,
      total_archived_wallets: 1,
      wallets: [
        { id: 'w-1', name: 'Dompet A', balance: 50000, owner_username: 'user1', is_archived: false },
        { id: 'w-2', name: 'Dompet B', balance: 100000, owner_username: 'user2', is_archived: false },
        { id: 'w-3', name: 'Dompet C', balance: 0, owner_username: undefined, is_archived: true },
      ],
      trends: {
        daily: [{ label: '2026-10-01', count: 2, total_amount: 50000 }],
        weekly: [{ label: '2026-W40', count: 5, total_amount: 150000 }],
        monthly: [{ label: '2026-10', count: 5, total_amount: 150000 }],
      },
    };

    vi.spyOn(client, 'request').mockResolvedValueOnce(backendResponse);

    const result = await getCreatorInsightsApi();

    expect(result.total_money_outside).toBe(150000);
    expect(result.active_wallets_count).toBe(3);
    expect(result.total_wallets_count).toBe(4);
    expect(result.daily_trends).toEqual([{ date: '2026-10-01', count: 2, volume: 50000 }]);
    expect(result.weekly_trends).toEqual([{ week: '2026-W40', count: 5, volume: 150000 }]);
    expect(result.monthly_trends).toEqual([{ month: '2026-10', count: 5, volume: 150000 }]);
    expect(result.wallet_balances).toHaveLength(3);
    expect(result.wallet_balances[0]).toEqual({
      wallet_id: 'w-1',
      wallet_name: 'Dompet A',
      balance: 50000,
      owner_username: 'user1',
      is_archived: false,
    });
  });

  it('handles fallback /api/wallets/insights if /api/insights fails', async () => {
    const fallbackResponse = {
      total_money_outside: 20000,
      active_wallets_count: 1,
      total_wallets_count: 1,
      total_titipan_volume: 20000,
      total_titipan_count: 1,
      daily_trends: [{ date: '2026-10-01', count: 1, volume: 20000 }],
      weekly_trends: [],
      monthly_trends: [],
      wallet_balances: [],
    };

    vi.spyOn(client, 'request')
      .mockRejectedValueOnce(new Error('404 Not Found'))
      .mockResolvedValueOnce(fallbackResponse);

    const result = await getCreatorInsightsApi();
    expect(result.total_money_outside).toBe(20000);
    expect(result.active_wallets_count).toBe(1);
    expect(result.daily_trends).toEqual([{ date: '2026-10-01', count: 1, volume: 20000 }]);
  });

  it('safely handles empty/missing insights payload defaults', async () => {
    vi.spyOn(client, 'request').mockResolvedValueOnce({});

    const result = await getCreatorInsightsApi();
    expect(result.total_money_outside).toBe(0);
    expect(result.active_wallets_count).toBe(0);
    expect(result.total_wallets_count).toBe(0);
    expect(result.daily_trends).toEqual([]);
    expect(result.weekly_trends).toEqual([]);
    expect(result.monthly_trends).toEqual([]);
    expect(result.wallet_balances).toEqual([]);
  });
});
