import { request } from './client';
import { Wallet, ItemSuggestion, CreatorInsights } from '../types';

export async function getWalletsApi(archived = false): Promise<Wallet[]> {
  const query = archived ? '?archived=true' : '';
  const data = await request<{ wallets: Wallet[] }>(`/api/wallets${query}`);
  return data?.wallets || [];
}

export async function getWalletApi(id: string): Promise<Wallet> {
  return request<Wallet>(`/api/wallets/${id}`);
}

export async function createWalletApi(name: string, targetOwnerUsername?: string): Promise<Wallet> {
  return request<Wallet>('/api/wallets', {
    method: 'POST',
    body: JSON.stringify({
      name,
      target_owner_username: targetOwnerUsername || undefined,
    }),
  });
}

export async function updateWalletNameApi(id: string, name: string): Promise<void> {
  await request(`/api/wallets/${id}/name`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function archiveWalletApi(id: string): Promise<void> {
  await request(`/api/wallets/${id}/archive`, { method: 'POST' });
}

export async function unarchiveWalletApi(id: string): Promise<void> {
  await request(`/api/wallets/${id}/unarchive`, { method: 'POST' });
}

export async function getItemSuggestionsApi(walletId: string): Promise<ItemSuggestion[]> {
  try {
    const data = await request<{ suggestions: ItemSuggestion[] }>(
      `/api/wallets/${walletId}/item-suggestions`
    );
    return data?.suggestions || [];
  } catch {
    return [];
  }
}

export async function unlinkWalletApi(walletId: string): Promise<{ message: string }> {
  // Supports DELETE /api/wallets/:id/link or fallback POST /api/wallets/:id/link/unlink
  try {
    return await request<{ message: string }>(`/api/wallets/${walletId}/link`, {
      method: 'DELETE',
    });
  } catch (err: unknown) {
    const apiErr = err as { status?: number };
    if (apiErr.status === 404 || apiErr.status === 405) {
      try {
        return await request<{ message: string }>(`/api/wallets/${walletId}/link/unlink`, {
          method: 'POST',
        });
      } catch {
        return await request<{ message: string }>(`/api/wallets/${walletId}/links`, {
          method: 'DELETE',
        });
      }
    }
    throw err;
  }
}

export async function getCreatorInsightsApi(): Promise<CreatorInsights> {
  let raw: any;
  try {
    raw = await request<any>('/api/insights');
  } catch {
    raw = await request<any>('/api/wallets/insights');
  }
  return {
    total_money_outside: raw.total_money_outside ?? raw.total_outstanding ?? 0,
    active_wallets_count: raw.active_wallets_count ?? raw.total_active_wallets ?? (raw.wallets ? raw.wallets.filter((w: any) => !w.is_archived).length : 0),
    total_wallets_count: raw.total_wallets_count ?? (raw.total_active_wallets != null ? raw.total_active_wallets + (raw.total_archived_wallets || 0) : 0),
    total_titipan_volume: raw.total_titipan_volume ?? 0,
    total_titipan_count: raw.total_titipan_count ?? 0,
    daily_trends: raw.daily_trends || (raw.trends?.daily?.map((d: any) => ({ date: d.period || d.label || '', count: d.count || 0, volume: d.amount ?? d.total_amount ?? 0 })) || []),
    weekly_trends: raw.weekly_trends || (raw.trends?.weekly?.map((d: any) => ({ week: d.period || d.label || '', count: d.count || 0, volume: d.amount ?? d.total_amount ?? 0 })) || []),
    monthly_trends: raw.monthly_trends || (raw.trends?.monthly?.map((d: any) => ({ month: d.period || d.label || '', count: d.count || 0, volume: d.amount ?? d.total_amount ?? 0 })) || []),
    wallet_balances: raw.wallet_balances || (raw.wallets?.map((w: any) => ({
      wallet_id: w.id,
      wallet_name: w.name,
      balance: w.balance || 0,
      owner_username: w.owner_username,
      is_archived: !!w.is_archived,
    })) || []),
    cached_at: raw.cached_at,
  };
}
