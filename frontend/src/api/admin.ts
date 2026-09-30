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
