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
  try {
    const data = await request<CreatorInsights>('/api/insights');
    return data;
  } catch {
    const data = await request<CreatorInsights>('/api/wallets/insights');
    return data;
  }
}
