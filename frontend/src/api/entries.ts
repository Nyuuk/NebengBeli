import { request } from './client';
import { Entry, EntryType, BatchEntryItem, BatchCreateEntriesResponse } from '../types';

export interface CreateEntryPayload {
  client_id?: string;
  type: EntryType;
  amount: number;
  item_name: string;
  note?: string;
  corrects_entry_id?: string | null;
  correction_reason?: string;
  occurred_at?: string;
}

export async function createEntryApi(
  walletId: string,
  payload: CreateEntryPayload
): Promise<{ entry: Entry; is_duplicate: boolean }> {
  const headers: Record<string, string> = {};
  if (payload.client_id) {
    headers['Client-ID'] = payload.client_id;
  }

  return request<{ entry: Entry; is_duplicate: boolean }>(
    `/api/wallets/${walletId}/entries`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }
  );
}

export async function batchCreateEntriesApi(
  entries: BatchEntryItem[]
): Promise<BatchCreateEntriesResponse> {
  return request<BatchCreateEntriesResponse>('/api/entries/batch', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export async function batchCreateWalletEntriesApi(
  walletId: string,
  entries: BatchEntryItem[]
): Promise<BatchCreateEntriesResponse> {
  return request<BatchCreateEntriesResponse>(`/api/wallets/${walletId}/entries/batch`, {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export interface MoveEntryPayload {
  source_wallet_id: string;
  target_wallet_id: string;
  entry_id: string;
  notes: string;
}

export async function moveEntryApi(payload: MoveEntryPayload): Promise<{
  message: string;
  correction_entry: Entry;
  new_entry: Entry;
}> {
  return request('/api/entries/move', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getEntryApi(id: string): Promise<Entry> {
  return request<Entry>(`/api/entries/${id}`);
}
