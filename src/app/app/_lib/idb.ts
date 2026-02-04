type IdbStore = {
  name: string;
  keyPath: string;
};

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
      if (res && typeof (res as any).onsuccess === "function") {
        (res as any).onsuccess = () => resolve((res as any).result as T);
        (res as any).onerror = () => reject((res as any).error);
      } else {
        resolve(res as T);
      }
    } catch (e) {
      reject(e);
    }
    tx.onerror = () => reject(tx.error);
  });
}

