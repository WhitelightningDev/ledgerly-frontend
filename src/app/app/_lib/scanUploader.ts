import {
  listScanQueue,
  putScanQueueItem,
  type ScanQueueItem,
} from "./scanQueue";

let running = false;

export async function processScanQueueUploads(args: {
  apiUrl: string;
  token: string;
}): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  running = true;
  try {
    const items = await listScanQueue();
    items.sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const item of items) {
      if (item.status === "uploading" || item.status === "uploaded") continue;
      await uploadOne({ apiUrl: args.apiUrl, token: args.token, item });
    }
  } finally {
    running = false;
  }
}

async function uploadOne(args: { apiUrl: string; token: string; item: ScanQueueItem }) {
  await putScanQueueItem({ ...args.item, status: "uploading", error: null });
  try {
    if (!args.item.blob) throw new Error("Missing image data.");
    const form = new FormData();
    const file = new File([args.item.blob], args.item.file_name, {
      type: args.item.mime_type,
    });
    form.append("file", file);
    form.append("company_id", args.item.company_id);
    const endpoint = args.item.doc_type === "invoice" ? "invoices" : "receipts";
    const res = await fetch(`${args.apiUrl}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${args.token}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || "Upload failed.");
    }
    let remoteId: string | null = null;
    try {
      const data = (await res.json()) as { id?: string };
      remoteId = data.id ?? null;
    } catch {
      remoteId = null;
    }
    await putScanQueueItem({
      ...args.item,
      status: "uploaded",
      error: null,
      remote_id: remoteId,
      blob: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed.";
    await putScanQueueItem({ ...args.item, status: "error", error: msg });
  }
}
