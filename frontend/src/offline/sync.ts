import { createEntryApi, batchCreateEntriesApi } from '../api/entries';
import {
  getPendingOfflineEntries,
  removePendingOfflineEntry,
  markOfflineEntryFailed,
  queueOfflineEntry,
} from './db';
import { BatchEntryItem } from '../types';

let isSyncRunning = false;

export async function syncOfflineQueue(
  onProgress?: (synced: number, total: number) => void
): Promise<{ synced: number; failed: number }> {
  if (isSyncRunning) {
    return { synced: 0, failed: 0 };
  }

  isSyncRunning = true;
  try {
    const pending = await getPendingOfflineEntries();
    if (!pending || pending.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let synced = 0;
    let failed = 0;

    // Try batching titipan entries if there are multiple standard entries
    const standardTitipan = pending.filter(
      (p) => p.type === 'titipan' && !p.corrects_entry_id
    );

    if (standardTitipan.length > 1) {
      try {
        const batchItems: BatchEntryItem[] = standardTitipan.map((item) => ({
          client_id: item.client_id,
          wallet_id: item.wallet_id,
          type: item.type,
          amount: item.amount,
          item_name: item.item_name,
          note: item.note,
          occurred_at: item.occurred_at,
        }));

        await batchCreateEntriesApi(batchItems);

        for (const item of standardTitipan) {
          await removePendingOfflineEntry(item.client_id);
          synced++;
          if (onProgress) {
            onProgress(synced, pending.length);
          }
        }
      } catch (batchErr: unknown) {
        // If batch fails, fallback to sequential single entry processing
        console.warn('Batch sync failed, falling back to sequential processing:', batchErr);
      }
    }

    // Refresh remaining pending after batch attempt
    const remainingPending = await getPendingOfflineEntries();

    for (let i = 0; i < remainingPending.length; i++) {
      const item = remainingPending[i];
      try {
        await createEntryApi(item.wallet_id, {
          client_id: item.client_id,
          type: item.type,
          amount: item.type === 'koreksi' ? (item.target_amount ?? item.final_nominal ?? item.amount) : item.amount,
          target_amount: item.target_amount,
          final_nominal: item.final_nominal,
          item_name: item.item_name,
          note: item.note,
          corrects_entry_id: item.corrects_entry_id,
          correction_reason: item.correction_reason,
          occurred_at: item.occurred_at,
        });

        // Remove from IDB once synced (server returned 201 Created or 200 OK for idempotent duplicate)
        await removePendingOfflineEntry(item.client_id);
        synced++;
        if (onProgress) {
          onProgress(synced, pending.length);
        }
      } catch (err: unknown) {
        const apiErr = err as { status?: number; message?: string };
        // If error is duplicate (409) or successful duplicate return (200), remove
        if (apiErr.status === 409) {
          await removePendingOfflineEntry(item.client_id);
          synced++;
        } else if (apiErr.status && [400, 403, 404, 422].includes(apiErr.status)) {
          // Permanent rejection by server: mark as failed in IDB with reason so user can inspect / discard
          const reason = apiErr.message || `Ditolak server (HTTP ${apiErr.status})`;
          console.warn(`Offline item rejected by server (${apiErr.status}):`, item.client_id, reason);
          await markOfflineEntryFailed(item.client_id, reason);
          failed++;
        } else {
          // Network error or 5xx persisting, increment retry count and keep in queue
          item.retry_count = (item.retry_count || 0) + 1;
          await queueOfflineEntry(item);
          failed++;
          break; // Stop loop if network is unreachable
        }
      }
    }

    // Dispatch global event so views know sync finished
    window.dispatchEvent(new CustomEvent('nebengbeli:synced', { detail: { synced, failed } }));

    return { synced, failed };
  } finally {
    isSyncRunning = false;
  }
}
