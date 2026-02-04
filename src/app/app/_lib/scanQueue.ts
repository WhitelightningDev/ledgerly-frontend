import { openDb, withStore } from "./idb";

export type ScanDocType = "receipt" | "invoice";

export type ScanItemStatus = "queued" | "uploading" | "error";

export type ScanQueueItem = {
  id: string;
  company_id: string;
  doc_type: ScanDocType;
  created_at: string;
  file_name: string;
  mime_type: string;
  blob: Blob;
  status: ScanItemStatus;
  error: string | null;
};

const DB_NAME = "ledgerly";
const DB_VERSION = 1;
const STORE = "scan_queue";

async function db() {
  return await openDb({
    dbName: DB_NAME,
    version: DB_VERSION,
    stores: [{ name: STORE, keyPath: "id" }],
  });
}

export async function listScanQueue(): Promise<ScanQueueItem[]> {
  const d = await db();
  return await withStore({
    db: d,
    storeName: STORE,
    mode: "readonly",
    run: (s) => s.getAll(),
  });
}

export async function putScanQueueItem(item: ScanQueueItem): Promise<void> {
  const d = await db();
  await withStore({
    db: d,
    storeName: STORE,
    mode: "readwrite",
    run: (s) => s.put(item),
  });
}

export async function deleteScanQueueItem(id: string): Promise<void> {
  const d = await db();
  await withStore({
    db: d,
    storeName: STORE,
    mode: "readwrite",
    run: (s) => s.delete(id),
  });
}

