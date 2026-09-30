import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  adminGetTrendsAdapterApi,
  adminGetBreakdownsAdapterApi,
  adminListAllTransactionsAdapterApi,
} from '../api/admin';
import * as clientApi from '../api/client';
import { Wallet } from '../types';

describe('Admin Trends and Breakdown Compatible Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('synthesizes proportional trends from aggregate stats when endpoint is unmounted', async () => {
    vi.spyOn(clientApi, 'request').mockImplementation(async (path: string) => {
      if (path === '/api/admin/trends') {
        const err = new clientApi.ApiError('Not found', 404);
        throw err;
      }
      if (path === '/api/admin/stats') {
        return {
          stats: {
            total_users: 10,
            total_wallets: 5,
            active_wallets: 4,
            archived_wallets: 1,
            total_entries: 50,
            total_volume: 500000,
            total_audit_logs: 12,
          },
        };
      }
      return {};
    });

    const result = await adminGetTrendsAdapterApi();
    expect(result.trends).toBeDefined();
    expect(result.trends.daily_trends.length).toBe(7);
    expect(result.trends.weekly_trends.length).toBe(4);
    expect(result.trends.monthly_trends.length).toBe(3);

    const totalDailyVolume = result.trends.daily_trends.reduce((sum, d) => sum + d.volume, 0);
    expect(totalDailyVolume).toBeGreaterThan(0);
  });

  it('aggregates creator breakdowns and wallet metrics with typed structure', async () => {
    const mockWallets: Wallet[] = [
      {
        id: 'w-1',
        name: 'Rendy - Kopi',
        creator_id: 'creator-1',
        creator_username: 'rahmat',
        owner_id: 'user-rendy',
        owner_username: 'rendy',
        balance: 35000,
        entry_count: 5,
        is_archived: false,
        created_at: new Date().toISOString(),
      },
      {
        id: 'w-2',
        name: 'Budi - Makan',
        creator_id: 'creator-1',
        creator_username: 'rahmat',
        owner_id: 'user-budi',
        owner_username: 'budi',
        balance: 20000,
        entry_count: 3,
        is_archived: false,
        created_at: new Date().toISOString(),
      },
    ];

    vi.spyOn(clientApi, 'request').mockImplementation(async (path: string) => {
      if (path === '/api/admin/breakdown') {
        const err = new clientApi.ApiError('Not found', 404);
        throw err;
      }
      if (path.startsWith('/api/admin/wallets')) {
        return {
          wallets: mockWallets,
          total: 2,
        };
      }
      if (path === '/api/admin/stats') {
        return {
          stats: {
            total_users: 3,
            total_wallets: 2,
            active_wallets: 2,
            archived_wallets: 0,
            total_entries: 8,
            total_volume: 55000,
            total_audit_logs: 4,
          },
        };
      }
      return {};
    });

    const breakdown = await adminGetBreakdownsAdapterApi();
    expect(breakdown.creators.length).toBe(1);
    expect(breakdown.creators[0].creator_username).toBe('rahmat');
    expect(breakdown.creators[0].wallet_count).toBe(2);
    expect(breakdown.creators[0].total_outstanding_balance).toBe(55000);
    expect(breakdown.wallets.length).toBe(2);
  });

  it('provides safe fallback for admin transactions list stub', async () => {
    const res = await adminListAllTransactionsAdapterApi();
    expect(res.entries).toBeDefined();
    expect(Array.isArray(res.entries)).toBe(true);
    expect(res.is_stub).toBe(true);
  });
});
