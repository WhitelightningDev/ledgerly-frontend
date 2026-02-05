"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  deleteScanQueueItem,
  listScanQueue,
  putScanQueueItem,
  type ScanQueueItem,
} from "../../../_lib/scanQueue";
import { deleteScanSession, getScanSession, setActiveSession, type ScanSession } from "../../../_lib/scanSessions";

function getCompanyId() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_company_id");
}

export default function ScanSessionDetailPage() {
  const router = useRouter();
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const companyId = useMemo(() => getCompanyId() ?? "", []);

  const [session, setSession] = useState<ScanSession | null>(null);
  const [items, setItems] = useState<ScanQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, q] = await Promise.all([getScanSession(sessionId), listScanQueue()]);
      setSession(s);
      const filtered = q.filter((i) => i.session_id === sessionId && i.company_id === companyId);
      filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
      setItems(filtered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function continueScanning() {
    if (!companyId) return;
    await setActiveSession(companyId, sessionId);
    router.push("/app/scan");
  }

  async function removeItem(id: string) {
    await deleteScanQueueItem(id);
    await load();
  }

  async function retryItem(item: ScanQueueItem) {
    await putScanQueueItem({ ...item, status: "queued", error: null });
    await load();
  }

  async function archiveSession() {
    const ok = window.confirm(
      "Archive this session and remove its stored items (including uploaded references)?",
    );
    if (!ok) return;
    for (const i of items) await deleteScanQueueItem(i.id);
    await deleteScanSession(sessionId);
    router.push("/app/scan/sessions");
  }

  const uploadedCount = items.filter((i) => i.status === "uploaded").length;
  const pendingCount = items.filter((i) => i.status === "queued" || i.status === "uploading").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Link
            href="/app/scan/sessions"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            ← Back to sessions
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Review {items.length} item(s)
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {session ? `${session.title} (${session.day_key})` : "Session"} • {uploadedCount} uploaded • {pendingCount} pending • {errorCount} error(s)
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void continueScanning()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Continue scanning
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={() => void archiveSession()}
            className="inline-flex h-11 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 px-5 text-sm font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
          >
            Archive session
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-black">
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
            {loading ? "Loading…" : "No items in this session."}
          </div>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {items.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {i.doc_type} • {i.status}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    {new Date(i.created_at).toLocaleString()}
                    {i.error ? ` • ${i.error}` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {i.status === "uploaded" && i.remote_id ? (
                    <Link
                      href={
                        i.doc_type === "invoice"
                          ? `/app/invoices/${i.remote_id}`
                          : `/app/inbox/${i.remote_id}`
                      }
                      className="inline-flex h-10 items-center justify-center rounded-full bg-amber-600 px-5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
                    >
                      Open
                    </Link>
                  ) : null}
                  {i.status === "error" ? (
                    <button
                      onClick={() => void retryItem(i)}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    >
                      Retry
                    </button>
                  ) : null}
                  <button
                    onClick={() => void removeItem(i.id)}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 px-5 text-sm font-medium text-red-700 transition-colors hover:bg-red-500/15 dark:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

