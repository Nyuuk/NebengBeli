import { createEntryApi } from '../api/entries';
import { getPendingOfflineEntries, removePendingOfflineEntry, queueOfflineEntry } from './db';

let isSyncRunning = false;

export async function syncOfflineQueue(onProgress?: (synced: number, total: number) => void): Promise<{ synced: number; failed: number }> {
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

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      try {
        await createEntryApi(item.wallet_id, {
          client_id: item.client_id,
          type: item.type,
          amount: item.amount,
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
        const apiErr = err as { status?: number };
        // If error is duplicate (409) or client error that cannot be resolved (400, 403, 404, 422), discard from queue
        if (apiErr.status && [400, 403, 404, 409, 422].includes(apiErr.status)) {
          console.warn(`Offline item resolved or rejected by server (${apiErr.status}), removing from queue:`, item.client_id);
          await removePendingOfflineEntry(item.client_id);
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

    return { synced, failed };
  } finally {
    isSyncRunning = false;
  }
}
