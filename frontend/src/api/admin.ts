import { request } from './client';
import { AuditLog, User, Wallet } from '../types';

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
  return request<{ users: User[]; total: number }>(`/api/admin/users?limit=${limit}&offset=${offset}`);
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
  return request<{ wallets: Wallet[]; total: number }>(`/api/admin/wallets?limit=${limit}&offset=${offset}`);
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
  return request<{ audit_logs: AuditLog[]; total: number }>(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`);
}

export async function adminGetStatsApi(): Promise<{ stats: AdminStats }> {
  return request<{ stats: AdminStats }>('/api/admin/stats');
}
