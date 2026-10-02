import { request } from './client';
import {
  AuditLog,
  User,
  Wallet,
  AdminTrends,
  AdminEntriesFilter,
  AdminEntriesResponse,
  AdminSummaryResponse,
  AdminCreatorsResponse,
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
  breakdown?: Record<string, { count: number; total_amount: number; total_volume: number }>;
}

export async function adminListUsersApi(limit = 50, offset = 0): Promise<{ users: User[]; total: number }> {
  const data = await request<{ users?: User[]; total?: number }>(`/api/admin/users?limit=${limit}&offset=${offset}`);
  if (!data || typeof data !== 'object' || !Array.isArray(data.users)) {
    throw new Error('Malformed users response from server');
  }
  return { users: data.users, total: typeof data.total === 'number' ? data.total : data.users.length };
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
  const data = await request<{ wallets?: Wallet[]; total?: number }>(`/api/admin/wallets?limit=${limit}&offset=${offset}`);
  if (!data || typeof data !== 'object' || !Array.isArray(data.wallets)) {
    throw new Error('Malformed wallets response from server');
  }
  return { wallets: data.wallets, total: typeof data.total === 'number' ? data.total : data.wallets.length };
}

export async function adminListAuditLogsApi(params: {
  limit?: number;
  offset?: number;
  action?: string;
  target_type?: string;
  actor_id?: string;
} = {}): Promise<{ audit_logs: AuditLog[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) searchParams.set('limit', params.limit.toString());
  if (params.offset !== undefined) searchParams.set('offset', params.offset.toString());
  if (params.action) searchParams.set('action', params.action);
  if (params.target_type) searchParams.set('target_type', params.target_type);
  if (params.actor_id) searchParams.set('actor_id', params.actor_id);

  const qs = searchParams.toString();
  const data = await request<{ audit_logs?: AuditLog[]; total?: number }>(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`);
  if (!data || typeof data !== 'object' || !Array.isArray(data.audit_logs)) {
    throw new Error('Malformed audit logs response from server');
  }
  return { audit_logs: data.audit_logs, total: typeof data.total === 'number' ? data.total : data.audit_logs.length };
}

export async function adminGetStatsApi(): Promise<{ stats: AdminStats }> {
  const data = await request<{ stats?: AdminStats }>('/api/admin/stats');
  if (!data || typeof data !== 'object' || !data.stats || typeof data.stats !== 'object') {
    throw new Error('Malformed stats response from server');
  }
  return { stats: data.stats };
}

export async function adminGetTrendsApi(): Promise<{ trends: AdminTrends }> {
  const data = await request<{ trends?: AdminTrends }>('/api/admin/trends');
  if (
    !data ||
    typeof data !== 'object' ||
    !data.trends ||
    typeof data.trends !== 'object' ||
    !Array.isArray(data.trends.daily) ||
    !Array.isArray(data.trends.weekly) ||
    !Array.isArray(data.trends.monthly)
  ) {
    throw new Error('Malformed trends response from server');
  }
  return { trends: data.trends };
}

export async function adminListEntriesApi(params: AdminEntriesFilter = {}): Promise<AdminEntriesResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) searchParams.set('limit', params.limit.toString());
  if (params.offset !== undefined) searchParams.set('offset', params.offset.toString());
  if (params.page !== undefined) searchParams.set('page', params.page.toString());
  if (params.type) searchParams.set('type', params.type);
  if (params.wallet_id) searchParams.set('wallet_id', params.wallet_id);
  if (params.creator_id) searchParams.set('creator_id', params.creator_id);
  if (params.user_id) searchParams.set('user_id', params.user_id);
  if (params.period) searchParams.set('period', params.period);
  if (params.range) searchParams.set('range', params.range);
  if (params.start_date) searchParams.set('start_date', params.start_date);
  if (params.end_date) searchParams.set('end_date', params.end_date);

  const qs = searchParams.toString();
  const data = await request<AdminEntriesResponse>(`/api/admin/entries${qs ? `?${qs}` : ''}`);
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) {
    throw new Error('Malformed entries response from server');
  }
  return {
    entries: data.entries,
    total: typeof data.total === 'number' ? data.total : data.entries.length,
    summary: data.summary,
    page: data.page ?? 1,
    limit: data.limit ?? (params.limit ?? 50),
  };
}

export async function adminGetSummaryApi(params: AdminEntriesFilter = {}): Promise<AdminSummaryResponse> {
  const searchParams = new URLSearchParams();
  if (params.period) searchParams.set('period', params.period);
  if (params.range) searchParams.set('range', params.range);
  if (params.start_date) searchParams.set('start_date', params.start_date);
  if (params.end_date) searchParams.set('end_date', params.end_date);
  if (params.type) searchParams.set('type', params.type);
  if (params.wallet_id) searchParams.set('wallet_id', params.wallet_id);
  if (params.creator_id) searchParams.set('creator_id', params.creator_id);
  if (params.user_id) searchParams.set('user_id', params.user_id);

  const qs = searchParams.toString();
  const data = await request<AdminSummaryResponse>(`/api/admin/summary${qs ? `?${qs}` : ''}`);
  if (!data || typeof data !== 'object' || !data.summary || typeof data.summary !== 'object') {
    throw new Error('Malformed summary response from server');
  }
  return {
    total_count: typeof data.total_count === 'number' ? data.total_count : 0,
    summary: data.summary,
  };
}

export async function adminListCreatorsApi(): Promise<AdminCreatorsResponse> {
  const data = await request<AdminCreatorsResponse>('/api/admin/creators');
  if (!data || typeof data !== 'object' || !Array.isArray(data.creators)) {
    throw new Error('Malformed creators response from server');
  }
  return {
    creators: data.creators,
    total: typeof data.total === 'number' ? data.total : data.creators.length,
  };
}

// Legacy read-only adapters remain for backwards-compatible consumers. Current
// admin UI uses the typed endpoint methods above and does not synthesize live data.
export async function adminGetTrendsAdapterApi(): Promise<{ trends: AdminTrendsData; is_synthesized: boolean }> {
  try {
    const data = await request<{ trends: AdminTrendsData }>('/api/admin/trends');
    const trends = data?.trends;
    if (trends && Array.isArray(trends.daily_trends) && Array.isArray(trends.weekly_trends) && Array.isArray(trends.monthly_trends)) {
      return { trends, is_synthesized: false };
    }
  } catch {
    // Fall through to legacy synthesis only when the endpoint is unavailable.
  }

  const statsRes = await adminGetStatsApi().catch(() => ({ stats: { total_entries: 0, total_volume: 0 } as AdminStats }));
  const totalVolume = statsRes.stats.total_volume || 0;
  const totalEntries = statsRes.stats.total_entries || 0;
  const now = new Date();
  const makePoint = (label: string, weight: number) => ({ period_label: label, count: Math.round(totalEntries * weight), volume: Math.round(totalVolume * weight) });
  const daily_trends = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (6 - i));
    return makePoint(day.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), (i + 1) / 28);
  });
  const weekly_trends = Array.from({ length: 4 }, (_, i) => makePoint(`Minggu ${i + 1}`, 0.25));
  const monthly_trends = Array.from({ length: 3 }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
    return makePoint(month.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }), 0.33);
  });
  return { trends: { daily_trends, weekly_trends, monthly_trends }, is_synthesized: true };
}

export interface AdminBreakdownResponse {
  creators: AdminCreatorBreakdownItem[];
  wallets: AdminWalletBreakdownItem[];
  transaction_types: AdminTransactionTypeBreakdown;
  is_synthesized: boolean;
}

export async function adminGetBreakdownsAdapterApi(): Promise<AdminBreakdownResponse> {
  try {
    const data = await request<AdminBreakdownResponse>('/api/admin/breakdown');
    if (data?.creators && data?.wallets) return { ...data, is_synthesized: false };
  } catch {
    // The legacy breakdown endpoint is optional.
  }
  const [walletsData, statsData] = await Promise.all([
    adminListWalletsApi(100, 0).catch(() => ({ wallets: [] as Wallet[], total: 0 })),
    adminGetStatsApi().catch(() => ({ stats: { total_entries: 0, total_volume: 0 } as AdminStats })),
  ]);
  const creatorMap: Record<string, AdminCreatorBreakdownItem> = {};
  const wallets = walletsData.wallets.map((wallet) => {
    const creatorId = wallet.creator_id || 'unknown';
    const creator = creatorMap[creatorId] ||= { creator_id: creatorId, creator_username: wallet.creator_username || 'Unknown', wallet_count: 0, total_titipan_count: 0, total_titipan_volume: 0, total_outstanding_balance: 0 };
    creator.wallet_count++;
    creator.total_titipan_count += wallet.entry_count || 0;
    if (wallet.balance < 0) {
      creator.total_outstanding_balance += -wallet.balance;
      creator.total_titipan_volume += -wallet.balance;
    }
    return { wallet_id: wallet.id, wallet_name: wallet.name, creator_username: wallet.creator_username || 'Admin', owner_username: wallet.owner_username, balance: wallet.balance || 0, entry_count: wallet.entry_count || 0, is_archived: Boolean(wallet.is_archived), created_at: wallet.created_at };
  });
  const entries = statsData.stats.total_entries || 0;
  const volume = statsData.stats.total_volume || 0;
  return { creators: Object.values(creatorMap), wallets, transaction_types: { titipan_count: Math.round(entries * 0.7), titipan_volume: volume, topup_count: Math.round(entries * 0.25), topup_volume: Math.round(volume * 0.9), koreksi_count: Math.max(0, entries - Math.round(entries * 0.95)), koreksi_volume: Math.round(volume * 0.05) }, is_synthesized: true };
}

export async function adminListAllTransactionsAdapterApi(limit = 50, offset = 0): Promise<{ entries: Entry[]; total: number; is_stub: boolean }> {
  try {
    const data = await request<{ entries: Entry[]; total: number }>(`/api/admin/transactions?limit=${limit}&offset=${offset}`);
    if (data?.entries) return { entries: data.entries, total: data.total ?? data.entries.length, is_stub: false };
  } catch {
    // This legacy endpoint is optional.
  }
  return { entries: [], total: 0, is_stub: true };
}
