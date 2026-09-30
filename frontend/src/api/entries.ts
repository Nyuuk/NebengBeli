import { request } from './client';
import { Entry, EntryType, BatchEntryItem, BatchCreateEntriesResponse } from '../types';
import { queueOfflineEntry } from '../offline/db';
import { v4 as uuidv4 } from 'uuid';

export interface CreateEntryPayload {
  client_id?: string;
  type: EntryType;
  amount: number;
  target_amount?: number;
  final_nominal?: number;
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

/**
 * Backend Dependency Documentation:
 * Online Move Endpoint: POST /api/entries/move
 * Request Body: { source_wallet_id: string, target_wallet_id: string, entry_id: string, notes: string }
 * Response: { message: string, correction_entry: Entry, new_entry: Entry }
 *
 * Offline-Safe Strategy:
 * When offline or when network connectivity is lost (HTTP 0 / NetworkError),
 * the move operation is decomposed into two atomic offline ledger mutations:
 * 1. A correction in the source wallet (reversing the entry to 0 with reason 'Salah Dompet')
 * 2. A new titipan entry in the target wallet (carrying over effective amount & item name)
 * Both mutations are assigned UUID client_ids and queued chronologically in IndexedDB for replay.
 */
export interface MoveEntryAdapterParams {
  source_wallet_id: string;
  target_wallet_id: string;
  targetEntry: Entry;
  notes: string;
  isOnline: boolean;
  userId?: string;
}

export interface MoveEntryAdapterResponse {
  is_offline: boolean;
  message: string;
  correction_entry?: Entry;
  new_entry?: Entry;
}

export async function moveEntryAdapter({
  source_wallet_id,
  target_wallet_id,
  targetEntry,
  notes,
  isOnline,
  userId,
}: MoveEntryAdapterParams): Promise<MoveEntryAdapterResponse> {
  const effectiveAmount =
    targetEntry.effective_amount !== undefined
      ? targetEntry.effective_amount
      : targetEntry.amount;

  if (isOnline) {
    try {
      const res = await moveEntryApi({
        source_wallet_id,
        target_wallet_id,
        entry_id: targetEntry.id,
        notes: notes.trim(),
      });
      return {
        is_offline: false,
        message: res.message || 'Entri berhasil dipindahkan.',
        correction_entry: res.correction_entry,
        new_entry: res.new_entry,
      };
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      // If network failure / dropped connection, fallback to offline decomposition
      if (apiErr.status === 0 || !apiErr.status) {
        return executeOfflineMove(source_wallet_id, target_wallet_id, targetEntry, notes, effectiveAmount, userId);
      }
      throw err;
    }
  }

  return executeOfflineMove(source_wallet_id, target_wallet_id, targetEntry, notes, effectiveAmount, userId);
}

async function executeOfflineMove(
  source_wallet_id: string,
  target_wallet_id: string,
  targetEntry: Entry,
  notes: string,
  effectiveAmount: number,
  userId?: string
): Promise<MoveEntryAdapterResponse> {
  const now = new Date().toISOString();
  const corrClientId = uuidv4();
  const newClientId = uuidv4();

  // 1. Correction to 0 in source wallet
  const delta = -effectiveAmount;
  const reason = 'Salah Dompet';
  const corrNote = notes.trim()
    ? `Pindah ke dompet lain (${notes.trim()})`
    : 'Pindah ke dompet lain';

  await queueOfflineEntry({
    client_id: corrClientId,
    user_id: userId,
    wallet_id: source_wallet_id,
    type: 'koreksi',
    amount: delta,
    item_name: targetEntry.item_name,
    note: corrNote,
    corrects_entry_id: targetEntry.id,
    correction_reason: reason,
    occurred_at: now,
    created_at: now,
    retry_count: 0,
    status: 'pending',
  }, userId);

  // 2. New titipan in target wallet
  const newEntryNote = notes.trim()
    ? `Dipindahkan dari dompet sebelumnya: ${notes.trim()}`
    : 'Dipindahkan dari dompet sebelumnya';

  await queueOfflineEntry({
    client_id: newClientId,
    user_id: userId,
    wallet_id: target_wallet_id,
    type: 'titipan',
    amount: effectiveAmount,
    item_name: targetEntry.item_name,
    note: newEntryNote,
    occurred_at: now,
    created_at: now,
    retry_count: 0,
    status: 'pending',
  }, userId);

  const mockCorrection: Entry = {
    id: corrClientId,
    client_id: corrClientId,
    wallet_id: source_wallet_id,
    type: 'koreksi',
    amount: delta,
    item_name: targetEntry.item_name,
    note: corrNote,
    corrects_entry_id: targetEntry.id,
    correction_reason: reason,
    occurred_at: now,
    created_by: 'me',
    created_at: now,
    created_by_username: 'Anda (Offline)',
    is_offline_pending: true,
  };

  const mockNewEntry: Entry = {
    id: newClientId,
    client_id: newClientId,
    wallet_id: target_wallet_id,
    type: 'titipan',
    amount: effectiveAmount,
    item_name: targetEntry.item_name,
    note: newEntryNote,
    occurred_at: now,
    created_by: 'me',
    created_at: now,
    created_by_username: 'Anda (Offline)',
    is_offline_pending: true,
  };

  return {
    is_offline: true,
    message: 'Entri pemindahan disimpan ke antrean offline dan akan disinkronkan saat terhubung.',
    correction_entry: mockCorrection,
    new_entry: mockNewEntry,
  };
}
