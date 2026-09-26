import { request } from './client';
import { Wallet } from '../types';

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
