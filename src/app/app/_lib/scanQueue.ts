import { withStore } from "./idb";
import { openScanDb, STORE_SCAN_QUEUE } from "./scanDb";

export type ScanDocType = "receipt" | "invoice";

export type ScanItemStatus = "queued" | "uploading" | "uploaded" | "error";

export type ScanQueueItem = {
  id: string;
  company_id: string;
  session_id: string;
  doc_type: ScanDocType;
  created_at: string;
  file_name: string;
  mime_type: string;
  blob: Blob | null;
  status: ScanItemStatus;
  error: string | null;
  remote_id?: string | null;
};

export async function listScanQueue(): Promise<ScanQueueItem[]> {
  const d = await openScanDb();
  const raw = await withStore({
    db: d,
    storeName: STORE_SCAN_QUEUE,
    mode: "readonly",
    run: (s) => s.getAll(),
  });
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((row) => {
    const r = (typeof row === "object" && row != null ? (row as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >;
    const status =
      r.status === "queued" ||
      r.status === "uploading" ||
      r.status === "uploaded" ||
      r.status === "error"
        ? (r.status as ScanItemStatus)
        : ("queued" as const);
    return {
      id: String(r.id ?? ""),
      company_id: String(r.company_id ?? ""),
      session_id: String(r.session_id ?? "legacy"),
      doc_type: r.doc_type === "invoice" ? "invoice" : "receipt",
      created_at: String(r.created_at ?? new Date().toISOString()),
      file_name: String(r.file_name ?? "scan.jpg"),
      mime_type: String(r.mime_type ?? "image/jpeg"),
      blob: (r.blob as Blob | null) ?? null,
      status,
      error: (r.error as string | null) ?? null,
      remote_id: (r.remote_id as string | null) ?? null,
    } satisfies ScanQueueItem;
  });
}

export async function putScanQueueItem(item: ScanQueueItem): Promise<void> {
  const d = await openScanDb();
  await withStore({
    db: d,
    storeName: STORE_SCAN_QUEUE,
    mode: "readwrite",
    run: (s) => s.put(item),
  });
}

export async function deleteScanQueueItem(id: string): Promise<void> {
  const d = await openScanDb();
  await withStore({
    db: d,
    storeName: STORE_SCAN_QUEUE,
    mode: "readwrite",
    run: (s) => s.delete(id),
  });
}
