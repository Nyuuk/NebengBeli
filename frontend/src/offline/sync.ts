import { createEntryApi } from '../api/entries';
import { getPendingOfflineEntries, removePendingOfflineEntry, queueOfflineEntry } from './db';

export async function syncOfflineQueue(onProgress?: (synced: number, total: number) => void): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingOfflineEntries();
  if (pending.length === 0) {
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

      // Remove from IDB once synced
      await removePendingOfflineEntry(item.client_id);
      synced++;
      if (onProgress) {
        onProgress(synced, pending.length);
      }
    } catch (err: unknown) {
      // If error is duplicate or client error that cannot be resolved, remove or update retry
      const apiErr = err as { status?: number };
      if (apiErr.status === 400 || apiErr.status === 403 || apiErr.status === 404) {
        console.error(`Offline item rejected by server (${apiErr.status}), discarding:`, item);
        await removePendingOfflineEntry(item.client_id);
        failed++;
      } else {
        // Network error still persisting, increment retry count and keep in queue
        item.retry_count = (item.retry_count || 0) + 1;
        await queueOfflineEntry(item);
        failed++;
        break; // Stop loop if network is down again
      }
    }
  }

  return { synced, failed };
}
