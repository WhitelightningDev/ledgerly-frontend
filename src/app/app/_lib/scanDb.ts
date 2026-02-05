import { openDb } from "./idb";

export const SCAN_DB_NAME = "ledgerly";
export const SCAN_DB_VERSION = 2;

export const STORE_SCAN_QUEUE = "scan_queue";
export const STORE_SCAN_SESSIONS = "scan_sessions";

export async function openScanDb(): Promise<IDBDatabase> {
  return await openDb({
    dbName: SCAN_DB_NAME,
    version: SCAN_DB_VERSION,
    stores: [
      { name: STORE_SCAN_QUEUE, keyPath: "id" },
      { name: STORE_SCAN_SESSIONS, keyPath: "id" },
    ],
  });
}

