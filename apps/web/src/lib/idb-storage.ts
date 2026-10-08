import type { PersistStorage, StorageValue } from 'zustand/middleware';

const DB = 'questwright';
const STORE = 'kv';
const WRITE_DELAY_MS = 800;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const idbGet = <T,>(key: string) => run<T | undefined>('readonly', (s) => s.get(key));
export const idbSet = (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key));

/**
 * Persists the studio to IndexedDB, which holds a whole series where
 * localStorage tops out at a few megabytes. Writes are batched: the latest
 * state is saved shortly after changes stop, and right away when the tab is
 * hidden. Reads an older localStorage save once.
 */
export function idbPersist<S>(): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    idbSet(name, value).catch(() => {
      try {
        localStorage.setItem(name, JSON.stringify(value));
      } catch {
        /* storage full or blocked: nothing more to try */
      }
    });
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  }
  return {
    async getItem(name) {
      try {
        const v = await idbGet<StorageValue<S>>(name);
        if (v) return v;
      } catch {
        /* fall through */
      }
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, WRITE_DELAY_MS);
    },
    async removeItem(name) {
      pending = null;
      await run('readwrite', (s) => s.delete(name)).catch(() => undefined);
    },
  };
}
