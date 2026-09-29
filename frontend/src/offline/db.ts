import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PendingOfflineEntry } from '../types';

interface NebengBeliDB extends DBSchema {
  offline_entries: {
    key: string;
    value: PendingOfflineEntry;
    indexes: { 'by-wallet': string; 'by-created': string };
  };
}

const DB_NAME = 'nebengbeli_offline_db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<NebengBeliDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<NebengBeliDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NebengBeliDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains('offline_entries')) {
            db.deleteObjectStore('offline_entries');
          }
        }
        if (!db.objectStoreNames.contains('offline_entries')) {
          const store = db.createObjectStore('offline_entries', {
            keyPath: 'client_id',
          });
          store.createIndex('by-wallet', 'wallet_id');
          store.createIndex('by-created', 'created_at');
        }
      },
    });
  }
  return dbPromise;
}

export async function queueOfflineEntry(entry: PendingOfflineEntry): Promise<void> {
  const db = await getDB();
  await db.put('offline_entries', entry);
}

export async function getPendingOfflineEntries(): Promise<PendingOfflineEntry[]> {
  const db = await getDB();
  return db.getAll('offline_entries');
}

export async function getPendingOfflineEntriesByWallet(walletId: string): Promise<PendingOfflineEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex('offline_entries', 'by-wallet', walletId);
}

export async function removePendingOfflineEntry(clientId: string): Promise<void> {
  const db = await getDB();
  await db.delete('offline_entries', clientId);
}

export async function getPendingOfflineCount(): Promise<number> {
  const db = await getDB();
  return db.count('offline_entries');
}
