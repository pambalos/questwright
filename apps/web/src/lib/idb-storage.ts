import type { PersistStorage, StorageValue } from 'zustand/middleware';

const DB = 'questwright';
const STORE = 'kv';
const WRITE_DELAY_MS = 800;

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  // One connection, so writes and the reads after them run in the order they were made.
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
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
export const idbDelete = (key: string) => run('readwrite', (s) => s.delete(key));

export type SaveStatus = 'saved' | 'saving' | 'error';
let status: SaveStatus = 'saved';
const listeners = new Set<(s: SaveStatus) => void>();
const flushers = new Set<() => Promise<void>>();

function setStatus(next: SaveStatus) {
  status = next;
  for (const fn of listeners) fn(next);
}

/** Follows whether the open book has been written to disk. */
export function onSaveStatus(fn: (s: SaveStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => void listeners.delete(fn);
}

/** Writes any pending change now, and resolves once it is on disk. */
export async function flushSaves(): Promise<void> {
  await Promise.all([...flushers].map((f) => f()));
}

/**
 * Persists the studio to IndexedDB, which holds a whole series where
 * localStorage tops out at a few megabytes. Writes are batched: the latest
 * state is saved shortly after changes stop, and right away when the tab is
 * hidden. Reads an older localStorage save once.
 */
export function idbPersist<S>(): PersistStorage<S> {
  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();
  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return writing;
    const { name, value } = pending;
    pending = null;
    writing = writing.then(() =>
      idbSet(name, value).then(
        () => {
          if (!pending) setStatus('saved');
        },
        () => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
            if (!pending) setStatus('saved');
          } catch {
            setStatus('error');
          }
        },
      ),
    );
    return writing;
  };
  flushers.add(flush);
  if (typeof window !== 'undefined') {
    // The desktop app calls this before closing its window, so the last keystrokes are kept.
    (window as Window & { __questwrightFlush?: () => Promise<void> }).__questwrightFlush = flushSaves;
    window.addEventListener('pagehide', () => void flush());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush());
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
      setStatus('saving');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), WRITE_DELAY_MS);
    },
    async removeItem(name) {
      pending = null;
      await run('readwrite', (s) => s.delete(name)).catch(() => undefined);
    },
  };
}
