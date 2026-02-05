type IdbStore = {
  name: string;
  keyPath: string;
};

function isIdbRequest<T>(value: unknown): value is IDBRequest<T> {
  if (typeof value !== "object" || value == null) return false;
  return (
    "onsuccess" in value &&
    "onerror" in value &&
    "result" in value
  );
}

export async function openDb(args: {
  dbName: string;
  version: number;
  stores: IdbStore[];
}): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const req = indexedDB.open(args.dbName, args.version);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of args.stores) {
        if (!db.objectStoreNames.contains(s.name)) {
          db.createObjectStore(s.name, { keyPath: s.keyPath });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function withStore<T>(args: {
  db: IDBDatabase;
  storeName: string;
  mode: IDBTransactionMode;
  run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>;
}): Promise<T> {
  return await new Promise(async (resolve, reject) => {
    const tx = args.db.transaction(args.storeName, args.mode);
    const store = tx.objectStore(args.storeName);
    try {
      const res = await args.run(store);
      if (isIdbRequest<T>(res)) {
        res.onsuccess = () => resolve(res.result);
        res.onerror = () => reject(res.error);
      } else {
        resolve(res as T);
      }
    } catch (e) {
      reject(e);
    }
    tx.onerror = () => reject(tx.error);
  });
}
