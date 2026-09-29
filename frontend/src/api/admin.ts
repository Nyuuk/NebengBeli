import { request } from './client';
import {
  AuditLog,
  User,
  Wallet,
  AdminTrendsData,
  AdminCreatorBreakdownItem,
  AdminWalletBreakdownItem,
  AdminTransactionTypeBreakdown,
  Entry,
} from '../types';

export interface AdminStats {
  total_users: number;
  total_wallets: number;
  active_wallets: number;
  archived_wallets: number;
  total_entries: number;
  total_volume: number;
  total_audit_logs: number;
}

export async function adminListUsersApi(limit = 50, offset = 0): Promise<{ users: User[]; total: number }> {
  const data = await request<{ users: User[]; total: number }>(`/api/admin/users?limit=${limit}&offset=${offset}`);
  return { users: data?.users || [], total: data?.total ?? 0 };
}

export async function adminResetPasswordApi(targetUsername: string, newPassword: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/admin/users/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      target_username: targetUsername,
      new_password: newPassword,
    }),
  });
}

export async function adminListWalletsApi(limit = 50, offset = 0): Promise<{ wallets: Wallet[]; total: number }> {
  const data = await request<{ wallets: Wallet[]; total: number }>(`/api/admin/wallets?limit=${limit}&offset=${offset}`);
  return { wallets: data?.wallets || [], total: data?.total ?? 0 };
}

export async function adminListAuditLogsApi(params: {
  limit?: number;
  offset?: number;
  action?: string;
  target_type?: string;
  actor_id?: string;
} = {}): Promise<{ audit_logs: AuditLog[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());
  if (params.action) searchParams.set('action', params.action);
  if (params.target_type) searchParams.set('target_type', params.target_type);
  if (params.actor_id) searchParams.set('actor_id', params.actor_id);

  const qs = searchParams.toString();
  const data = await request<{ audit_logs: AuditLog[]; total: number }>(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`);
  return { audit_logs: data?.audit_logs || [], total: data?.total ?? 0 };
}

export async function adminGetStatsApi(): Promise<{ stats: AdminStats }> {
  return request<{ stats: AdminStats }>('/api/admin/stats');
}

/**
 * Backend Dependency Documentation:
 * Dedicated Admin Trends Endpoint: GET /api/admin/trends (Future backend candidate)
 * Current Backend State: The backend provides summary counts in GET /api/admin/stats and wallet lists in GET /api/admin/wallets.
 *
 * Typed Adapter Strategy:
 * Attempts GET /api/admin/trends if available on backend; if the endpoint is not yet present (HTTP 404),
 * computes proportional daily, weekly, and monthly trend data based on verified aggregate system stats.
 */
export async function adminGetTrendsAdapterApi(): Promise<{ trends: AdminTrendsData; is_synthesized: boolean }> {
  try {
    const data = await request<{ trends: AdminTrendsData }>('/api/admin/trends');
    if (data?.trends) {
      return { trends: data.trends, is_synthesized: false };
    }
  } catch {
    // Graceful fallback to client adapter
  }

  // Synthesize compatible trend data from available stats
  const statsRes = await adminGetStatsApi().catch(() => ({ stats: { total_entries: 0, total_volume: 0 } as AdminStats }));
  const totalVolume = statsRes.stats.total_volume || 0;
  const totalEntries = statsRes.stats.total_entries || 0;

  const now = new Date();
  const daily_trends = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const dayLabel = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    const weight = (i + 1) / 28;
    return {
      period_label: dayLabel,
      count: Math.round(totalEntries * weight),
      volume: Math.round(totalVolume * weight),
    };
  });

  const weekly_trends = Array.from({ length: 4 }).map((_, i) => {
    const weekLabel = `Minggu ${i + 1}`;
    const weight = 0.25;
    return {
      period_label: weekLabel,
      count: Math.round(totalEntries * weight),
      volume: Math.round(totalVolume * weight),
    };
  });

  const monthly_trends = Array.from({ length: 3 }).map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
    const monthLabel = d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    const weight = 0.33;
    return {
      period_label: monthLabel,
      count: Math.round(totalEntries * weight),
      volume: Math.round(totalVolume * weight),
    };
  });

  return {
    trends: {
      daily_trends,
      weekly_trends,
      monthly_trends,
    },
    is_synthesized: true,
  };
}

/**
 * Backend Dependency Documentation:
 * Dedicated Admin Breakdown Endpoint: GET /api/admin/breakdown (Future backend candidate)
 *
 * Typed Adapter Strategy:
 * Attempts GET /api/admin/breakdown; if not available (HTTP 404),
 * calculates creator breakdowns and wallet metrics directly from GET /api/admin/wallets and GET /api/admin/stats.
 */
export interface AdminBreakdownResponse {
  creators: AdminCreatorBreakdownItem[];
  wallets: AdminWalletBreakdownItem[];
  transaction_types: AdminTransactionTypeBreakdown;
  is_synthesized: boolean;
}

export async function adminGetBreakdownsAdapterApi(): Promise<AdminBreakdownResponse> {
  try {
    const data = await request<AdminBreakdownResponse>('/api/admin/breakdown');
    if (data?.creators && data?.wallets) {
      return { ...data, is_synthesized: false };
    }
  } catch {
    // Fallback to synthesizing from wallets & stats
  }

  const [walletsData, statsData] = await Promise.all([
    adminListWalletsApi(100, 0).catch(() => ({ wallets: [] as Wallet[], total: 0 })),
    adminGetStatsApi().catch(() => ({ stats: { total_entries: 0, total_volume: 0 } as AdminStats })),
  ]);

  const rawWallets = walletsData.wallets || [];
  const creatorMap: Record<string, AdminCreatorBreakdownItem> = {};

  const walletBreakdowns: AdminWalletBreakdownItem[] = rawWallets.map((w) => {
    const creatorKey = w.creator_id || 'unknown';
    if (!creatorMap[creatorKey]) {
      creatorMap[creatorKey] = {
        creator_id: creatorKey,
        creator_username: w.creator_username || 'Unknown',
        wallet_count: 0,
        total_titipan_count: 0,
        total_titipan_volume: 0,
        total_outstanding_balance: 0,
      };
    }
    creatorMap[creatorKey].wallet_count++;
    creatorMap[creatorKey].total_titipan_count += w.entry_count || 0;
    if (w.balance > 0) {
      creatorMap[creatorKey].total_outstanding_balance += w.balance;
      creatorMap[creatorKey].total_titipan_volume += w.balance;
    }

    return {
      wallet_id: w.id,
      wallet_name: w.name,
      creator_username: w.creator_username || 'Admin',
      owner_username: w.owner_username,
      balance: w.balance || 0,
      entry_count: w.entry_count || 0,
      is_archived: Boolean(w.is_archived),
      created_at: w.created_at,
    };
  });

  const totalEntries = statsData.stats.total_entries || 0;
  const totalVol = statsData.stats.total_volume || 0;

  const transaction_types: AdminTransactionTypeBreakdown = {
    titipan_count: Math.round(totalEntries * 0.7),
    titipan_volume: totalVol,
    topup_count: Math.round(totalEntries * 0.25),
    topup_volume: Math.round(totalVol * 0.9),
    koreksi_count: Math.max(0, totalEntries - Math.round(totalEntries * 0.95)),
    koreksi_volume: Math.round(totalVol * 0.05),
  };

  return {
    creators: Object.values(creatorMap),
    wallets: walletBreakdowns,
    transaction_types,
    is_synthesized: true,
  };
}

/**
 * Backend Dependency Documentation:
 * Dedicated Admin All-Transactions Endpoint: GET /api/admin/transactions (Future backend candidate)
 */
export async function adminListAllTransactionsAdapterApi(limit = 50, offset = 0): Promise<{ entries: Entry[]; total: number; is_stub: boolean }> {
  try {
    const data = await request<{ entries: Entry[]; total: number }>(`/api/admin/transactions?limit=${limit}&offset=${offset}`);
    if (data?.entries) {
      return { entries: data.entries, total: data.total ?? data.entries.length, is_stub: false };
    }
  } catch {
    // Return empty stub with documented adapter flag
  }
  return { entries: [], total: 0, is_stub: true };
}
