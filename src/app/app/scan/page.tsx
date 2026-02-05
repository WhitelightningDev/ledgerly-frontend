"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  deleteScanQueueItem,
  listScanQueue,
  putScanQueueItem,
  type ScanDocType,
  type ScanQueueItem,
} from "../_lib/scanQueue";
import { uuid } from "../_lib/localStore";
import {
  getActiveSession,
  getOrCreateActiveSession,
  getScanSession,
  touchSession,
} from "../_lib/scanSessions";

import { getApiUrl } from "../../_lib/apiUrl";

function getToken() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_access_token");
}

function getCompanyId() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_company_id");
}

type SplitMode = "none" | "horizontal2" | "vertical2";

export default function ScanPage() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const token = useMemo(() => getToken(), []);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadingRef = useRef(false);

  const [queue, setQueue] = useState<ScanQueueItem[]>([]);
  const [docType, setDocType] = useState<ScanDocType>("receipt");
  const [autoCrop, setAutoCrop] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("none");
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    void refreshQueue();
    function onOnline() {
      void processQueue();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const companyId = getCompanyId();
    if (!companyId) return;
    const active = getActiveSession(companyId);
    if (active) setSessionId(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      const s = await getScanSession(sessionId);
      if (s) setSessionTitle(s.title);
    })();
  }, [sessionId]);

  useEffect(() => {
    void processQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  useEffect(() => {
    void startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshQueue() {
    const items = await listScanQueue();
    items.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setQueue(items);
  }

  async function startCamera() {
    setCaptureError(null);
    setStartingCamera(true);
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as MediaTrackCapabilities | undefined;
      const supported = Boolean(caps && "torch" in caps);
      setTorchSupported(supported);
      setTorchOn(false);
    } catch (e) {
      setCaptureError(
        e instanceof Error ? e.message : "Could not access camera. Check permissions.",
      );
    } finally {
      setStartingCamera(false);
    }
  }

  function stopCamera() {
    const stream = streamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
    }
    streamRef.current = null;
  }

  async function setTorch(next: boolean) {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    try {
      // Torch is supported via advanced constraints on some mobile browsers.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (track as any).applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setTorchOn(false);
    }
  }

  async function capture() {
    if (!videoRef.current) return;
    setCaptureError(null);
    setUploadError(null);

    const companyId = getCompanyId();
    if (!token) {
      setCaptureError("Not logged in.");
      return;
    }
    if (!companyId) {
      setCaptureError("Select a company first.");
      return;
    }

    const session = await getOrCreateActiveSession({ companyId });
    setSessionId(session.id);
    setSessionTitle(session.title);
    await touchSession(session.id);

    const video = videoRef.current;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    let blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    if (!blob) {
      setCaptureError("Capture failed.");
      return;
    }

    // Best-effort auto-crop to the non-white content area.
    if (autoCrop) {
      try {
        blob = await autoCropBlob(blob);
      } catch {
        // ignore crop errors
      }
    }

    // Optional basic splitting into two docs.
    if (splitMode !== "none") {
      const splits = await splitBlob(blob, splitMode);
      for (const b of splits) {
        await enqueue(companyId, session.id, docType, b);
      }
    } else {
      await enqueue(companyId, session.id, docType, blob);
    }

    await refreshQueue();
    void processQueue();
  }

  async function enqueue(companyId: string, sessionIdValue: string, type: ScanDocType, blob: Blob) {
    const id = uuid();
    const created = new Date().toISOString();
    const fileName = `${type}_${created.replace(/[:.]/g, "-")}.jpg`;
    const item: ScanQueueItem = {
      id,
      company_id: companyId,
      session_id: sessionIdValue,
      doc_type: type,
      created_at: created,
      file_name: fileName,
      mime_type: blob.type || "image/jpeg",
      blob,
      status: "queued",
      error: null,
      remote_id: null,
    };
    await putScanQueueItem(item);
  }

  async function markStatus(id: string, patch: Partial<ScanQueueItem>) {
    const existing = queue.find((q) => q.id === id);
    if (!existing) {
      // refresh and try again
      await refreshQueue();
      return;
    }
    await putScanQueueItem({ ...existing, ...patch });
    await refreshQueue();
  }

  async function processQueue() {
    if (uploadingRef.current) return;
    if (!navigator.onLine) return;
    const t = getToken();
    const companyId = getCompanyId();
    if (!t || !companyId) return;

    uploadingRef.current = true;
    setUploadError(null);
    try {
      const items = await listScanQueue();
      items.sort((a, b) => a.created_at.localeCompare(b.created_at));

      for (const item of items) {
        if (item.status === "uploading" || item.status === "uploaded") continue;
        await uploadOne(item, t);
      }
      await refreshQueue();
    } finally {
      uploadingRef.current = false;
    }
  }

  async function uploadOne(item: ScanQueueItem, tokenStr: string) {
    await markStatus(item.id, { status: "uploading", error: null });
    try {
      if (!item.blob) throw new Error("Missing image data.");
      const form = new FormData();
      const file = new File([item.blob], item.file_name, { type: item.mime_type });
      form.append("file", file);
      form.append("company_id", item.company_id);
      const endpoint = item.doc_type === "invoice" ? "invoices" : "receipts";
      const res = await fetch(`${apiUrl}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenStr}` },
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
        ...item,
        status: "uploaded",
        error: null,
        remote_id: remoteId,
        blob: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed.";
      setUploadError(msg);
      await markStatus(item.id, { status: "error", error: msg });
    }
  }

  async function retry(id: string) {
    setUploadError(null);
    await markStatus(id, { status: "queued", error: null });
    void processQueue();
  }

  async function remove(id: string) {
    await deleteScanQueueItem(id);
    await refreshQueue();
  }

  async function removeUploadedFromQueue() {
    const items = await listScanQueue();
    const toDelete = items.filter(
      (i) => i.company_id === getCompanyId() && i.status === "uploaded",
    );
    for (const i of toDelete) await deleteScanQueueItem(i.id);
    await refreshQueue();
  }

  return (
    <main className="w-full px-4 py-6 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <Link
            href="/app"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            ← Back
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Scan mode</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Camera-first bulk capture. Works offline and uploads when online.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-3 py-1 dark:border-white/10 dark:bg-white/5">
              Session: {sessionTitle || "Auto"}
            </span>
            <Link href="/app/scan/sessions" className="underline">
              View sessions
            </Link>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <button
            onClick={() => void startCamera()}
            disabled={startingCamera}
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {startingCamera ? "Starting…" : "Restart camera"}
          </button>
          <button
            onClick={() => void capture()}
            disabled={startingCamera || !!captureError}
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Capture
          </button>
        </div>
      </div>

      {captureError ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {captureError}
        </div>
      ) : null}
      {uploadError ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Upload issue: {uploadError}
        </div>
      ) : null}

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Camera
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={autoCrop}
                  onChange={(e) => setAutoCrop(e.target.checked)}
                />
                Auto-crop
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                Split
                <select
                  value={splitMode}
                  onChange={(e) => setSplitMode(e.target.value as SplitMode)}
                  className="h-9 rounded-xl border border-black/10 bg-white px-2 text-xs text-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                >
                  <option value="none">None</option>
                  <option value="horizontal2">2 (top/bottom)</option>
                  <option value="vertical2">2 (left/right)</option>
                </select>
              </label>
              {torchSupported ? (
                <button
                  onClick={() => void setTorch(!torchOn)}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                >
                  {torchOn ? "Flash: on" : "Flash: off"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-black/10 bg-zinc-50 dark:border-white/10 dark:bg-white/5">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-[60vh] w-full object-cover"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm sm:col-span-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Upload as
              </span>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as ScanDocType)}
                className="mt-2 block h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm text-zinc-950 shadow-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              >
                <option value="receipt">Receipt (money out)</option>
                <option value="invoice">Invoice (money in)</option>
              </select>
            </label>
            <div className="sm:col-span-2 flex flex-col justify-end">
              <button
                onClick={() => void capture()}
                disabled={startingCamera || !!captureError}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-zinc-950 px-6 text-base font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Capture & continue
              </button>
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Tip: keep capturing—items queue and upload automatically when online.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Upload queue
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {queue.length} item(s)
              </div>
              <button
                onClick={() => void removeUploadedFromQueue()}
                className="text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                Clear uploaded
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {queue.length === 0 ? (
              <div className="rounded-xl border border-black/10 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
                Nothing queued yet. Take a photo to start.
              </div>
            ) : (
              queue.slice(0, 20).map((q) => (
                <QueueRow
                  key={q.id}
                  item={q}
                  onRetry={() => void retry(q.id)}
                  onRemove={() => void remove(q.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function QueueRow({
  item,
  onRetry,
  onRemove,
}: {
  item: ScanQueueItem;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const url = useMemo(() => {
    if (!item.blob) return null;
    return URL.createObjectURL(item.blob);
  }, [item.blob]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const badge =
    item.status === "queued"
      ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
      : item.status === "uploading"
        ? "bg-blue-500/10 text-blue-800 dark:text-blue-200"
        : "bg-red-500/10 text-red-800 dark:text-red-200";

  return (
    <div className="flex gap-3 rounded-xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-black">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={item.file_name}
          src={url}
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-zinc-100 dark:bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
            {item.doc_type}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs ${badge}`}>
            {item.status}
          </span>
        </div>
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          {new Date(item.created_at).toLocaleTimeString()}
          {item.error ? ` • ${item.error}` : ""}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.status === "error" ? (
            <button
              onClick={onRetry}
              className="inline-flex h-8 items-center justify-center rounded-full bg-zinc-950 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Retry
            </button>
          ) : null}
          <button
            onClick={onRemove}
            className="inline-flex h-8 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), mime, quality),
  );
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(blob);
  });
}

async function autoCropBlob(blob: Blob): Promise<Blob> {
  const img = await blobToImage(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Find bounding box of non-near-white pixels.
    const threshold = 245;
    let minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    let found = false;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        if (r < threshold || g < threshold || b < threshold) {
          found = true;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return blob;

    const pad = Math.round(Math.min(width, height) * 0.02);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    const cw = Math.max(1, maxX - minX);
    const ch = Math.max(1, maxY - minY);
    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    const octx = out.getContext("2d");
    if (!octx) return blob;
    octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return (await canvasToBlob(out, "image/jpeg", 0.92)) ?? blob;
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

async function splitBlob(blob: Blob, mode: SplitMode): Promise<Blob[]> {
  const img = await blobToImage(blob);
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return [blob];
    const parts: Array<{ x: number; y: number; w: number; h: number }> = [];

    if (mode === "horizontal2") {
      parts.push({ x: 0, y: 0, w, h: Math.floor(h / 2) });
      parts.push({ x: 0, y: Math.floor(h / 2), w, h: h - Math.floor(h / 2) });
    } else if (mode === "vertical2") {
      parts.push({ x: 0, y: 0, w: Math.floor(w / 2), h });
      parts.push({ x: Math.floor(w / 2), y: 0, w: w - Math.floor(w / 2), h });
    } else {
      return [blob];
    }

    const outBlobs: Blob[] = [];
    for (const p of parts) {
      canvas.width = p.w;
      canvas.height = p.h;
      ctx.clearRect(0, 0, p.w, p.h);
      ctx.drawImage(img, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
      const b = await canvasToBlob(canvas, "image/jpeg", 0.92);
      if (b) outBlobs.push(b);
    }
    return outBlobs.length ? outBlobs : [blob];
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
