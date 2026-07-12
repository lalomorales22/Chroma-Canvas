import { CanvasElement, LibraryItem, ProjectDoc } from '../types';
import { uid } from '../utils/id';

/**
 * Local persistence: media blobs + the project document live in IndexedDB so a
 * refresh (or crash) never loses work. Object URLs are recreated on load.
 */

const DB_NAME = 'chromacanvas';
const DB_VERSION = 1;
const MEDIA_STORE = 'media';
const PROJECT_STORE = 'projects';
const AUTOSAVE_KEY = 'autosave';

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE);
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

const tx = <T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> =>
  openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );

export const putMedia = async (blob: Blob, id: string = uid()): Promise<string> => {
  await tx(MEDIA_STORE, 'readwrite', (s) => s.put(blob, id));
  return id;
};

export const getMedia = (id: string): Promise<Blob | undefined> =>
  tx(MEDIA_STORE, 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);

export const deleteMedia = (id: string): Promise<unknown> =>
  tx(MEDIA_STORE, 'readwrite', (s) => s.delete(id));

const listMediaIds = (): Promise<string[]> =>
  tx(MEDIA_STORE, 'readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>).then((keys) =>
    keys.map(String),
  );

interface SerializedProject {
  savedAt: number;
  doc: ProjectDoc;
}

/** Strip runtime-only blob URLs before persisting (they die with the page). */
const serializeDoc = (doc: ProjectDoc): ProjectDoc => ({
  ...doc,
  elements: doc.elements.map((el) =>
    el.mediaId && el.src?.startsWith('blob:') ? { ...el, src: undefined } : el,
  ),
  library: doc.library.map((item) =>
    item.mediaId && item.src.startsWith('blob:') ? { ...item, src: '' } : item,
  ),
});

export const saveProject = async (doc: ProjectDoc): Promise<void> => {
  const payload: SerializedProject = { savedAt: Date.now(), doc: serializeDoc(doc) };
  await tx(PROJECT_STORE, 'readwrite', (s) => s.put(payload, AUTOSAVE_KEY));
};

export const hasSavedProject = async (): Promise<boolean> => {
  try {
    const saved = await tx(
      PROJECT_STORE,
      'readonly',
      (s) => s.get(AUTOSAVE_KEY) as IDBRequest<SerializedProject | undefined>,
    );
    return !!saved && (saved.doc.elements.length > 0 || saved.doc.library.length > 0);
  } catch {
    return false;
  }
};

export const clearProject = (): Promise<unknown> =>
  tx(PROJECT_STORE, 'readwrite', (s) => s.delete(AUTOSAVE_KEY));

/** Rebuild object URLs for stored media and drop entries whose blobs are gone. */
export const loadProject = async (): Promise<ProjectDoc | null> => {
  const saved = await tx(
    PROJECT_STORE,
    'readonly',
    (s) => s.get(AUTOSAVE_KEY) as IDBRequest<SerializedProject | undefined>,
  );
  if (!saved) return null;

  const doc = saved.doc;
  const mediaIds = new Set<string>();
  doc.elements.forEach((el) => el.mediaId && mediaIds.add(el.mediaId));
  doc.library.forEach((item) => item.mediaId && mediaIds.add(item.mediaId));

  const urlByMediaId = new Map<string, string>();
  await Promise.all(
    Array.from(mediaIds).map(async (id) => {
      const blob = await getMedia(id).catch(() => undefined);
      if (blob) urlByMediaId.set(id, URL.createObjectURL(blob));
    }),
  );

  const restoreElement = (el: CanvasElement): CanvasElement | null => {
    if (!el.mediaId) return el; // remote / data URLs persist as-is
    const url = urlByMediaId.get(el.mediaId);
    if (!url) return null;
    return { ...el, src: url };
  };
  const restoreLibrary = (item: LibraryItem): LibraryItem | null => {
    if (!item.mediaId) return item.src ? item : null;
    const url = urlByMediaId.get(item.mediaId);
    if (!url) return null;
    return { ...item, src: url };
  };

  return {
    ...doc,
    elements: doc.elements.map(restoreElement).filter((e): e is CanvasElement => e !== null),
    library: doc.library.map(restoreLibrary).filter((i): i is LibraryItem => i !== null),
  };
};

/** Remove stored blobs no longer referenced by the project (called after saves). */
export const collectGarbage = async (doc: ProjectDoc): Promise<void> => {
  try {
    const referenced = new Set<string>();
    doc.elements.forEach((el) => el.mediaId && referenced.add(el.mediaId));
    doc.library.forEach((item) => item.mediaId && referenced.add(item.mediaId));
    const all = await listMediaIds();
    await Promise.all(all.filter((id) => !referenced.has(id)).map((id) => deleteMedia(id)));
  } catch {
    // GC is best-effort; never let it break a save.
  }
};

/** Store a blob and return { mediaId, url } ready to use in the app. */
export const importBlob = async (blob: Blob): Promise<{ mediaId: string; url: string }> => {
  const mediaId = await putMedia(blob);
  return { mediaId, url: URL.createObjectURL(blob) };
};
