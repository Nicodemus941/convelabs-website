/**
 * Offline appointments cache — zero-dep IndexedDB wrapper.
 *
 * The phleb dashboard mirrors every appointment fetch into IndexedDB so that
 * when the phleb loses signal (basement, parking garage, rural home), they
 * still see today's schedule + every patient detail they need.
 *
 * We deliberately avoid a service worker here — this app has an existing
 * self-destructing SW (public/sw.js) and re-enabling one is a can of worms.
 * IndexedDB + navigator.onLine gives us 90% of the value for 10% of the risk.
 */

const DB_NAME = 'convelabs-phleb-cache';
const STORE = 'appointments';
const META_STORE = 'meta';
const DB_VERSION = 1;

type IDBRecord<T> = T & { __cachedAt: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheAppointments<T extends { id: string }>(rows: T[]): Promise<void> {
  if (!('indexedDB' in window)) return;
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE, META_STORE], 'readwrite');
      const store = tx.objectStore(STORE);
      const meta = tx.objectStore(META_STORE);
      const now = Date.now();

      // Clear prior cache then write the fresh set so removed appointments
      // don't linger offline
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        for (const r of rows) {
          store.put({ ...r, __cachedAt: now } as IDBRecord<T>);
        }
        meta.put({ key: 'lastSync', value: now });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[offline-cache] cache failed', e);
  }
}

export async function readCachedAppointments<T>(): Promise<{ rows: T[]; lastSync: number | null }> {
  if (!('indexedDB' in window)) return { rows: [], lastSync: null };
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE, META_STORE], 'readonly');
      const store = tx.objectStore(STORE);
      const meta = tx.objectStore(META_STORE);
      const rows: T[] = [];
      let lastSync: number | null = null;

      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          rows.push(cursor.value as T);
          cursor.continue();
        }
      };
      const metaReq = meta.get('lastSync');
      metaReq.onsuccess = () => { lastSync = metaReq.result?.value ?? null; };

      tx.oncomplete = () => resolve({ rows, lastSync });
      tx.onerror = () => resolve({ rows: [], lastSync: null });
    });
  } catch {
    return { rows: [], lastSync: null };
  }
}

export function subscribeToOnlineStatus(cb: (online: boolean) => void): () => void {
  const handler = () => cb(navigator.onLine);
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  handler();
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}
