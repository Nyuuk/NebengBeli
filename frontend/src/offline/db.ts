import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  PendingOfflineEntry,
  Wallet,
  StatementResponse,
  ItemSuggestion,
  CreatorInsights,
  ShoppingSessionDraft,
  User,
} from '../types';

interface CachedWalletRecord {
  id: string;
  user_id?: string;
  wallets: Wallet[];
  cached_at: string;
}

interface CachedStatementRecord {
  id: string;
  wallet_id: string;
  user_id?: string;
  data: StatementResponse;
  cached_at: string;
}

interface CachedSuggestionsRecord {
  id: string;
  wallet_id: string;
  user_id?: string;
  suggestions: ItemSuggestion[];
  cached_at: string;
}

interface CachedInsightsRecord {
  id: string;
  user_id?: string;
  data: CreatorInsights;
  cached_at: string;
}

interface ShoppingDraftRecord {
  id: string;
  user_id?: string;
  draft: ShoppingSessionDraft;
  updated_at: string;
}

export interface CachedUserRecord {
  id: string;
  user: User;
  cached_at: string;
}

interface NebengBeliDB extends DBSchema {
  offline_entries: {
    key: string;
    value: PendingOfflineEntry;
    indexes: {
      'by-wallet': string;
      'by-created': string;
      'by-status': string;
      'by-user'?: string;
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
  cached_user: {
    key: string;
    value: CachedUserRecord;
  };
}

const DB_NAME = 'nebengbeli_offline_db';
const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase<NebengBeliDB>> | null = null;
let activeUserId: string | null = null;

export function setCurrentUserId(userId: string | null): void {
  activeUserId = userId;
}

export function getCurrentUserId(): string | null {
  return activeUserId;
}

export function getDB(): Promise<IDBPDatabase<NebengBeliDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (!dbPromise) {
    dbPromise = openDB<NebengBeliDB>(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains('offline_entries')) {
          const store = db.createObjectStore('offline_entries', {
            keyPath: 'client_id',
          });
          store.createIndex('by-wallet', 'wallet_id');
          store.createIndex('by-created', 'created_at');
          store.createIndex('by-status', 'status');
          store.createIndex('by-user', 'user_id');
        } else {
          const store = transaction.objectStore('offline_entries');
          if (!store.indexNames.contains('by-status')) {
            store.createIndex('by-status', 'status');
          }
          if (!store.indexNames.contains('by-user')) {
            store.createIndex('by-user', 'user_id');
          }
        }

        if (!db.objectStoreNames.contains('cached_wallets')) {
          db.createObjectStore('cached_wallets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_statements')) {
          db.createObjectStore('cached_statements', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_suggestions')) {
          db.createObjectStore('cached_suggestions', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_insights')) {
          db.createObjectStore('cached_insights', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('shopping_draft')) {
          db.createObjectStore('shopping_draft', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_user')) {
          db.createObjectStore('cached_user', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// Reset DB instance (useful for tests)
export function resetDBInstance() {
  if (dbPromise) {
    dbPromise.then((db) => {
      try {
        db.close();
      } catch {
        // Ignore close error
      }
    }).catch(() => {});
  }
  dbPromise = null;
  activeUserId = null;
}

// Helper to check if an entry matches the active/target user
function matchesUser(entry: PendingOfflineEntry, targetUserId?: string | null): boolean {
  if (targetUserId === undefined) {
    targetUserId = activeUserId;
  }
  if (!targetUserId) {
    return true;
  }
  return !entry.user_id || entry.user_id === targetUserId;
}

// ================= Offline Queue Operations =================

export async function queueOfflineEntry(entry: PendingOfflineEntry, userId?: string): Promise<void> {
  const db = await getDB();
  const effectiveUserId = userId || entry.user_id || activeUserId || undefined;
  const item: PendingOfflineEntry = {
    ...entry,
    user_id: effectiveUserId,
    status: entry.status || 'pending',
  };
  await db.put('offline_entries', item);
}

export async function getPendingOfflineEntries(userId?: string): Promise<PendingOfflineEntry[]> {
  try {
    const db = await getDB();
    const all = await db.getAll('offline_entries');
    const targetUser = userId !== undefined ? userId : activeUserId;
    return all.filter((e) => e.status !== 'failed' && matchesUser(e, targetUser));
  } catch {
    return [];
  }
}

export async function getAllOfflineEntries(userId?: string): Promise<PendingOfflineEntry[]> {
  try {
    const db = await getDB();
    const all = await db.getAll('offline_entries');
    const targetUser = userId !== undefined ? userId : activeUserId;
    return all.filter((e) => matchesUser(e, targetUser));
  } catch {
    return [];
  }
}

export async function getPendingOfflineEntriesByWallet(walletId: string, userId?: string): Promise<PendingOfflineEntry[]> {
  try {
    const db = await getDB();
    const targetUser = userId !== undefined ? userId : activeUserId;
    let entries: PendingOfflineEntry[] = [];
    try {
      entries = await db.getAllFromIndex('offline_entries', 'by-wallet', walletId);
    } catch {
      const all = await db.getAll('offline_entries');
      entries = all.filter((e) => e.wallet_id === walletId);
    }
    return entries.filter((e) => matchesUser(e, targetUser));
  } catch {
    return [];
  }
}

export async function removePendingOfflineEntry(clientId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('offline_entries', clientId);
  } catch {
    // Ignore error
  }
}

export async function markOfflineEntryFailed(clientId: string, errorMessage: string): Promise<void> {
  try {
    const db = await getDB();
    const entry = await db.get('offline_entries', clientId);
    if (entry) {
      entry.status = 'failed';
      entry.error_message = errorMessage;
      await db.put('offline_entries', entry);
    }
  } catch {
    // Ignore error
  }
}

export async function moveFailedOfflineEntry(clientId: string, targetWalletId: string): Promise<void> {
  try {
    const db = await getDB();
    const entry = await db.get('offline_entries', clientId);
    if (entry) {
      entry.wallet_id = targetWalletId;
      entry.status = 'pending';
      entry.error_message = undefined;
      entry.retry_count = 0;
      await db.put('offline_entries', entry);
    }
  } catch {
    // Ignore error
  }
}

export async function retryFailedOfflineEntry(clientId: string): Promise<void> {
  try {
    const db = await getDB();
    const entry = await db.get('offline_entries', clientId);
    if (entry) {
      entry.status = 'pending';
      entry.error_message = undefined;
      entry.retry_count = 0;
      await db.put('offline_entries', entry);
    }
  } catch {
    // Ignore error
  }
}

export async function getPendingOfflineCount(userId?: string): Promise<number> {
  const entries = await getPendingOfflineEntries(userId);
  return entries.length;
}

export async function clearAllOfflineEntries(userId?: string): Promise<void> {
  try {
    const db = await getDB();
    if (userId) {
      const all = await db.getAll('offline_entries');
      for (const e of all) {
        if (e.user_id === userId) {
          await db.delete('offline_entries', e.client_id);
        }
      }
    } else {
      await db.clear('offline_entries');
    }
  } catch {
    // Ignore error
  }
}

// ================= Cache Operations =================

function getCacheKey(id: string, userId?: string): string {
  const uId = userId !== undefined ? userId : activeUserId || 'default';
  return `${uId}:${id}`;
}

export async function setCachedWallets(wallets: Wallet[], scope = 'all', userId?: string): Promise<void> {
  try {
    const db = await getDB();
    const effectiveUserId = userId !== undefined ? userId : (activeUserId || undefined);
    const key = getCacheKey(scope, effectiveUserId);
    await db.put('cached_wallets', {
      id: key,
      user_id: effectiveUserId,
      wallets,
      cached_at: new Date().toISOString(),
    });
  } catch {
    // Ignore error
  }
}

export async function getCachedWallets(scope = 'all', userId?: string): Promise<{ wallets: Wallet[]; cached_at: string } | null> {
  try {
    const db = await getDB();
    const targetUserId = userId !== undefined ? userId : (activeUserId || undefined);
    const key = getCacheKey(scope, targetUserId);
    let res = await db.get('cached_wallets', key);
    if (!res && targetUserId) {
      res = await db.get('cached_wallets', `default:${scope}`);
    }
    if (!res) {
      res = await db.get('cached_wallets', scope);
    }
    if (!res) return null;
    return { wallets: res.wallets, cached_at: res.cached_at };
  } catch {
    return null;
  }
}

export async function setCachedStatement(walletId: string, data: StatementResponse, userId?: string): Promise<void> {
  try {
    const db = await getDB();
    const effectiveUserId = userId !== undefined ? userId : (activeUserId || undefined);
    const key = getCacheKey(walletId, effectiveUserId);
    await db.put('cached_statements', {
      id: key,
      wallet_id: walletId,
      user_id: effectiveUserId,
      data,
      cached_at: new Date().toISOString(),
    });
  } catch {
    // Ignore error
  }
}

export async function getCachedStatement(walletId: string, userId?: string): Promise<{ data: StatementResponse; cached_at: string } | null> {
  try {
    const db = await getDB();
    const targetUserId = userId !== undefined ? userId : (activeUserId || undefined);
    const key = getCacheKey(walletId, targetUserId);
    let res = await db.get('cached_statements', key);
    if (!res && targetUserId) {
      res = await db.get('cached_statements', `default:${walletId}`);
    }
    if (!res) {
      res = await db.get('cached_statements', walletId);
    }
    if (!res) return null;
    return { data: res.data, cached_at: res.cached_at };
  } catch {
    return null;
  }
}

export async function setCachedSuggestions(walletId: string, suggestions: ItemSuggestion[], userId?: string): Promise<void> {
  try {
    const db = await getDB();
    const effectiveUserId = userId !== undefined ? userId : (activeUserId || undefined);
    const key = getCacheKey(walletId, effectiveUserId);
    await db.put('cached_suggestions', {
      id: key,
      wallet_id: walletId,
      user_id: effectiveUserId,
      suggestions,
      cached_at: new Date().toISOString(),
    });
  } catch {
    // Ignore error
  }
}

export async function getCachedSuggestions(walletId: string, userId?: string): Promise<{ suggestions: ItemSuggestion[]; cached_at: string } | null> {
  try {
    const db = await getDB();
    const targetUserId = userId !== undefined ? userId : (activeUserId || undefined);
    const key = getCacheKey(walletId, targetUserId);
    let res = await db.get('cached_suggestions', key);
    if (!res && targetUserId) {
      res = await db.get('cached_suggestions', `default:${walletId}`);
    }
    if (!res) {
      res = await db.get('cached_suggestions', walletId);
    }
    if (!res) return null;
    return { suggestions: res.suggestions, cached_at: res.cached_at };
  } catch {
    return null;
  }
}

export async function setCachedInsights(data: CreatorInsights, id = 'creator', userId?: string): Promise<void> {
  try {
    const db = await getDB();
    const effectiveUserId = userId !== undefined ? userId : (activeUserId || undefined);
    const key = getCacheKey(id, effectiveUserId);
    await db.put('cached_insights', {
      id: key,
      user_id: effectiveUserId,
      data,
      cached_at: new Date().toISOString(),
    });
  } catch {
    // Ignore error
  }
}

export async function getCachedInsights(id = 'creator', userId?: string): Promise<{ data: CreatorInsights; cached_at: string } | null> {
  try {
    const db = await getDB();
    const targetUserId = userId !== undefined ? userId : (activeUserId || undefined);
    const key = getCacheKey(id, targetUserId);
    let res = await db.get('cached_insights', key);
    if (!res && targetUserId) {
      res = await db.get('cached_insights', `default:${id}`);
    }
    if (!res) {
      res = await db.get('cached_insights', id);
    }
    if (!res) return null;
    return { data: res.data, cached_at: res.cached_at };
  } catch {
    return null;
  }
}

// ================= Shopping Session Draft Operations =================

export async function saveShoppingDraft(draft: ShoppingSessionDraft, userId?: string): Promise<void> {
  try {
    const db = await getDB();
    const key = getCacheKey('current', userId);
    await db.put('shopping_draft', {
      id: key,
      user_id: userId || activeUserId || undefined,
      draft,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Ignore error
  }
}

export async function getShoppingDraft(userId?: string): Promise<ShoppingSessionDraft | null> {
  try {
    const db = await getDB();
    const key = getCacheKey('current', userId);
    let res = await db.get('shopping_draft', key);
    if (!res && (!userId && !activeUserId)) {
      res = await db.get('shopping_draft', 'current');
    }
    return res ? res.draft : null;
  } catch {
    return null;
  }
}

export async function hasShoppingDraft(userId?: string): Promise<boolean> {
  const draft = await getShoppingDraft(userId);
  if (!draft || !draft.rows || draft.rows.length === 0) return false;
  return draft.rows.some((r) => r.wallet_id || r.item_name?.trim() || r.amount > 0 || r.amount_str?.trim());
}

export async function clearShoppingDraft(userId?: string): Promise<void> {
  try {
    const db = await getDB();
    const key = getCacheKey('current', userId);
    await db.delete('shopping_draft', key);
    if (!userId && !activeUserId) {
      await db.delete('shopping_draft', 'current');
    }
  } catch {
    // Ignore error
  }
}

// ================= User Session Cache Operations =================

const USER_CACHE_STORAGE_KEY = 'nebengbeli_cached_user';
const CURRENT_USER_RECORD_KEY = 'current_session';

/**
 * Sanitizes user profile to ensure only public fields are cached,
 * never storing passwords, secret credentials, or session tokens.
 */
export function sanitizeUser(user: User): User {
  const sanitized: User = {
    id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at,
    ...(user.needs_username_update !== undefined ? { needs_username_update: user.needs_username_update } : {}),
  };
  const raw = user as unknown as Record<string, unknown>;
  if (raw.claimed_username !== undefined) {
    (sanitized as unknown as Record<string, unknown>).claimed_username = raw.claimed_username;
  }
  return sanitized;
}

export async function setCachedUser(user: User): Promise<void> {
  const sanitized = sanitizeUser(user);
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await getDB();
      await db.put('cached_user', {
        id: CURRENT_USER_RECORD_KEY,
        user: sanitized,
        cached_at: new Date().toISOString(),
      });
    } catch {
      // Ignore IndexedDB error
    }
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(USER_CACHE_STORAGE_KEY, JSON.stringify(sanitized));
    }
  } catch {
    // Ignore localStorage errors
  }
}

export async function getCachedUser(): Promise<User | null> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await getDB();
      const record = await db.get('cached_user', CURRENT_USER_RECORD_KEY);
      if (record?.user) {
        return record.user;
      }
    } catch {
      // Ignore IndexedDB error
    }
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(USER_CACHE_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as User;
      }
    }
  } catch {
    // Ignore localStorage errors
  }

  return null;
}

export async function clearCachedUser(): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const db = await getDB();
      await db.delete('cached_user', CURRENT_USER_RECORD_KEY);
    } catch {
      // Ignore IndexedDB error
    }
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(USER_CACHE_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage errors
  }
}
