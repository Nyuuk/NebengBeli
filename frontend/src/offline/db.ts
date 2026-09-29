import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  PendingOfflineEntry,
  Wallet,
  StatementResponse,
  ItemSuggestion,
  CreatorInsights,
  ShoppingSessionDraft,
} from '../types';

interface CachedWalletRecord {
  id: string;
  wallets: Wallet[];
  cached_at: string;
}

interface CachedStatementRecord {
  wallet_id: string;
  data: StatementResponse;
  cached_at: string;
}

interface CachedSuggestionsRecord {
  wallet_id: string;
  suggestions: ItemSuggestion[];
  cached_at: string;
}

interface CachedInsightsRecord {
  id: string;
  data: CreatorInsights;
  cached_at: string;
}

interface ShoppingDraftRecord {
  id: string;
  draft: ShoppingSessionDraft;
  updated_at: string;
}

interface NebengBeliDB extends DBSchema {
  offline_entries: {
    key: string;
    value: PendingOfflineEntry;
    indexes: {
      'by-wallet': string;
      'by-created': string;
      'by-status': string;
    };
  };
  cached_wallets: {
    key: string;
    value: CachedWalletRecord;
  };
  cached_statements: {
    key: string;
    value: CachedStatementRecord;
  };
  cached_suggestions: {
    key: string;
    value: CachedSuggestionsRecord;
  };
  cached_insights: {
    key: string;
    value: CachedInsightsRecord;
  };
  shopping_draft: {
    key: string;
    value: ShoppingDraftRecord;
  };
}

const DB_NAME = 'nebengbeli_offline_db';
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<NebengBeliDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<NebengBeliDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NebengBeliDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 3) {
          // Re-create or create offline_entries
          if (!db.objectStoreNames.contains('offline_entries')) {
            const store = db.createObjectStore('offline_entries', {
              keyPath: 'client_id',
            });
            store.createIndex('by-wallet', 'wallet_id');
            store.createIndex('by-created', 'created_at');
            store.createIndex('by-status', 'status');
          } else {
            const store = (db as any).transaction?.objectStore('offline_entries');
            if (store && !store.indexNames.contains('by-status')) {
              store.createIndex('by-status', 'status');
            }
          }

          // Object stores for caching
          if (!db.objectStoreNames.contains('cached_wallets')) {
            db.createObjectStore('cached_wallets', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('cached_statements')) {
            db.createObjectStore('cached_statements', { keyPath: 'wallet_id' });
          }
          if (!db.objectStoreNames.contains('cached_suggestions')) {
            db.createObjectStore('cached_suggestions', { keyPath: 'wallet_id' });
          }
          if (!db.objectStoreNames.contains('cached_insights')) {
            db.createObjectStore('cached_insights', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('shopping_draft')) {
            db.createObjectStore('shopping_draft', { keyPath: 'id' });
          }
        }
      },
    });
  }
  return dbPromise;
}

// Reset DB instance (useful for tests)
export function resetDBInstance() {
  dbPromise = null;
}

// ================= Offline Queue Operations =================

export async function queueOfflineEntry(entry: PendingOfflineEntry): Promise<void> {
  const db = await getDB();
  const item: PendingOfflineEntry = {
    ...entry,
    status: entry.status || 'pending',
  };
  await db.put('offline_entries', item);
}

export async function getPendingOfflineEntries(): Promise<PendingOfflineEntry[]> {
  const db = await getDB();
  const all = await db.getAll('offline_entries');
  return all.filter((e) => e.status !== 'failed');
}

export async function getAllOfflineEntries(): Promise<PendingOfflineEntry[]> {
  const db = await getDB();
  return db.getAll('offline_entries');
}

export async function getPendingOfflineEntriesByWallet(walletId: string): Promise<PendingOfflineEntry[]> {
  const db = await getDB();
  const entries = await db.getAllFromIndex('offline_entries', 'by-wallet', walletId);
  return entries;
}

export async function removePendingOfflineEntry(clientId: string): Promise<void> {
  const db = await getDB();
  await db.delete('offline_entries', clientId);
}

export async function markOfflineEntryFailed(clientId: string, errorMessage: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get('offline_entries', clientId);
  if (entry) {
    entry.status = 'failed';
    entry.error_message = errorMessage;
    await db.put('offline_entries', entry);
  }
}

export async function getPendingOfflineCount(): Promise<number> {
  const db = await getDB();
  const entries = await db.getAll('offline_entries');
  return entries.filter((e) => e.status === 'pending' || !e.status).length;
}

export async function clearAllOfflineEntries(): Promise<void> {
  const db = await getDB();
  await db.clear('offline_entries');
}

// ================= Cache Operations =================

export async function setCachedWallets(wallets: Wallet[], scope = 'all'): Promise<void> {
  const db = await getDB();
  await db.put('cached_wallets', {
    id: scope,
    wallets,
    cached_at: new Date().toISOString(),
  });
}

export async function getCachedWallets(scope = 'all'): Promise<{ wallets: Wallet[]; cached_at: string } | null> {
  const db = await getDB();
  const res = await db.get('cached_wallets', scope);
  if (!res) return null;
  return { wallets: res.wallets, cached_at: res.cached_at };
}

export async function setCachedStatement(walletId: string, data: StatementResponse): Promise<void> {
  const db = await getDB();
  await db.put('cached_statements', {
    wallet_id: walletId,
    data,
    cached_at: new Date().toISOString(),
  });
}

export async function getCachedStatement(walletId: string): Promise<{ data: StatementResponse; cached_at: string } | null> {
  const db = await getDB();
  const res = await db.get('cached_statements', walletId);
  if (!res) return null;
  return { data: res.data, cached_at: res.cached_at };
}

export async function setCachedSuggestions(walletId: string, suggestions: ItemSuggestion[]): Promise<void> {
  const db = await getDB();
  await db.put('cached_suggestions', {
    wallet_id: walletId,
    suggestions,
    cached_at: new Date().toISOString(),
  });
}

export async function getCachedSuggestions(walletId: string): Promise<{ suggestions: ItemSuggestion[]; cached_at: string } | null> {
  const db = await getDB();
  const res = await db.get('cached_suggestions', walletId);
  if (!res) return null;
  return { suggestions: res.suggestions, cached_at: res.cached_at };
}

export async function setCachedInsights(data: CreatorInsights, id = 'creator'): Promise<void> {
  const db = await getDB();
  await db.put('cached_insights', {
    id,
    data,
    cached_at: new Date().toISOString(),
  });
}

export async function getCachedInsights(id = 'creator'): Promise<{ data: CreatorInsights; cached_at: string } | null> {
  const db = await getDB();
  const res = await db.get('cached_insights', id);
  if (!res) return null;
  return { data: res.data, cached_at: res.cached_at };
}

// ================= Shopping Session Draft Operations =================

export async function saveShoppingDraft(draft: ShoppingSessionDraft): Promise<void> {
  const db = await getDB();
  await db.put('shopping_draft', {
    id: 'current',
    draft,
    updated_at: new Date().toISOString(),
  });
}

export async function getShoppingDraft(): Promise<ShoppingSessionDraft | null> {
  const db = await getDB();
  const res = await db.get('shopping_draft', 'current');
  return res ? res.draft : null;
}

export async function clearShoppingDraft(): Promise<void> {
  const db = await getDB();
  await db.delete('shopping_draft', 'current');
}
