import { request } from './client';
import { LinkRequest } from '../types';

export async function createLinkRequestApi(
  walletId: string,
  targetUsername: string
): Promise<LinkRequest> {
  return request<LinkRequest>(`/api/wallets/${walletId}/links`, {
    method: 'POST',
    body: JSON.stringify({
      target_username: targetUsername,
    }),
  });
}

export async function listLinkRequestsApi(): Promise<LinkRequest[]> {
  const data = await request<{ link_requests: LinkRequest[] }>('/api/links');
  return data.link_requests;
}

export async function getLinkRequestApi(id: string): Promise<LinkRequest> {
  return request<LinkRequest>(`/api/links/${id}`);
}

export async function approveLinkRequestApi(id: string): Promise<{ message: string; link_request: LinkRequest }> {
  return request(`/api/links/${id}/approve`, { method: 'POST' });
}

export async function rejectLinkRequestApi(id: string): Promise<{ message: string; link_request: LinkRequest }> {
  return request(`/api/links/${id}/reject`, { method: 'POST' });
}
