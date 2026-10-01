import { Page } from '@playwright/test';

/**
 * Offline and IndexedDB testing utilities for NebengBeli.
 */

const DB_NAME = 'nebengbeli_offline_db';
const STORES = {
  OFFLINE_ENTRIES: 'offline_entries',
  CACHED_WALLETS: 'cached_wallets',
  CACHED_STATEMENTS: 'cached_statements',
  SHOPPING_DRAFT: 'shopping_draft',
  CACHED_SUGGESTIONS: 'cached_suggestions',
  CACHED_INSIGHTS: 'cached_insights',
};

/**
 * Read all pending offline entries from the browser's IndexedDB.
 */
export async function getPendingOfflineEntriesFromIDB(page: Page): Promise<any[]> {
  return page.evaluate((dbName) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const storeName = db.objectStoreNames.contains('offline_entries')
          ? 'offline_entries'
          : db.objectStoreNames.contains('pending_entries')
          ? 'pending_entries'
          : null;
        if (!storeName) {
          db.close();
          return resolve([]);
        }
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          db.close();
          resolve(getAllReq.result || []);
        };
        getAllReq.onerror = () => {
          db.close();
          reject(getAllReq.error);
        };
      };
    });
  }, DB_NAME);
}

/**
 * Read shopping draft from IndexedDB.
 */
export async function getShoppingDraftFromIDB(page: Page): Promise<any> {
  return page.evaluate((dbName) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const storeName = db.objectStoreNames.contains('shopping_draft')
          ? 'shopping_draft'
          : db.objectStoreNames.contains('shopping_drafts')
          ? 'shopping_drafts'
          : null;
        if (!storeName) {
          db.close();
          return resolve(null);
        }
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          db.close();
          const list = getAllReq.result || [];
          resolve(list.length > 0 ? list[0] : null);
        };
        getAllReq.onerror = () => {
          db.close();
          reject(getAllReq.error);
        };
      };
    });
  }, DB_NAME);
}

/**
 * Simulate browser going offline by aborting API requests and dispatching 'offline' window event.
 */
export async function simulateOffline(page: Page): Promise<void> {
  await page.route('**/api/**', (route) => route.abort('failed'));
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

/**
 * Restore browser online state by removing network blocks and dispatching 'online' event.
 */
export async function simulateOnline(page: Page): Promise<void> {
  await page.unroute('**/api/**');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'));
  });
}

/**
 * Check if Service Worker is registered.
 */
export async function checkServiceWorkerRegistration(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.length > 0;
  });
}
