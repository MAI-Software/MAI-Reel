import type { Project } from '../types';

/**
 * The session lives in IndexedDB so a reload does not throw the work away. Blobs are stored
 * as they are — nothing leaves the device, same as the rest of the app.
 */
const DB_NAME = 'mai-reel';
const DB_VERSION = 1;
const FILES = 'files';
const META = 'meta';

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  blob: Blob;
}

export interface StoredSession {
  project: Project;
  order: string[];
  packId?: string;
  section?: string;
  savedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb blocked'));
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexeddb failed'));
      }),
  );
}

export function isStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function putFile(file: StoredFile): Promise<void> {
  await run(FILES, 'readwrite', (s) => s.put(file));
}

export async function readFiles(ids: string[]): Promise<Map<string, StoredFile>> {
  const out = new Map<string, StoredFile>();
  for (const id of ids) {
    const found = await run<StoredFile | undefined>(FILES, 'readonly', (s) => s.get(id));
    if (found) out.set(id, found);
  }
  return out;
}

/** Drops every stored file that the given session no longer references. */
export async function pruneFiles(keep: string[]): Promise<void> {
  const ids = await run<IDBValidKey[]>(FILES, 'readonly', (s) => s.getAllKeys());
  const wanted = new Set(keep);
  for (const id of ids) {
    if (!wanted.has(String(id))) await run(FILES, 'readwrite', (s) => s.delete(id));
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await run(META, 'readwrite', (s) => s.put(session, 'session'));
}

export async function readSession(): Promise<StoredSession | undefined> {
  return run<StoredSession | undefined>(META, 'readonly', (s) => s.get('session'));
}

export async function clearSession(): Promise<void> {
  await run(META, 'readwrite', (s) => s.delete('session'));
  const ids = await run<IDBValidKey[]>(FILES, 'readonly', (s) => s.getAllKeys());
  for (const id of ids) await run(FILES, 'readwrite', (s) => s.delete(id));
}
