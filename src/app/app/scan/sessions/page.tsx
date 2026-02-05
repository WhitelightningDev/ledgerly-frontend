"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { listScanQueue, type ScanQueueItem } from "../../_lib/scanQueue";
import {
  deleteScanSession,
  getOrCreateActiveSession,
  listScanSessions,
  setActiveSession,
  type ScanSession,
} from "../../_lib/scanSessions";

function getCompanyId() {
  return typeof window === "undefined"
    ? null
    : localStorage.getItem("ledgerly_company_id");
}

type SessionRow = {
  session: ScanSession;
  total: number;
  queued: number;
  errors: number;
  uploaded: number;
};

export default function ScanSessionsPage() {
  const companyId = useMemo(() => getCompanyId() ?? "", []);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [sessions, queue] = await Promise.all([
        listScanSessions(companyId),
        listScanQueue(),
      ]);
      const bySession: Record<string, ScanQueueItem[]> = {};
      for (const q of queue) {
        if (q.company_id !== companyId) continue;
        (bySession[q.session_id] ||= []).push(q);
      }
      const mapped: SessionRow[] = sessions.map((s) => {
        const items = bySession[s.id] || [];
        const queued = items.filter((i) => i.status === "queued" || i.status === "uploading").length;
        const errors = items.filter((i) => i.status === "error").length;
        const uploaded = items.filter((i) => i.status === "uploaded").length;
        return {
          session: s,
          total: items.length,
          queued,
          errors,
          uploaded,
        };
      });
      setRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function newSession() {
    if (!companyId) return;
    const s = await getOrCreateActiveSession({ companyId, maxIdleMinutes: 0 });
    await setActiveSession(companyId, s.id);
    await load();
  }

  async function archiveEmpty(sessionId: string) {
    const ok = window.confirm("Archive this session? (Deletes the session record only.)");
    if (!ok) return;
    await deleteScanSession(sessionId);
    await load();
  }

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Link
            href="/app/scan"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            ← Back to scan
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Scan sessions</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Auto-grouped by day and capture time window.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void newSession()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            New session
          </button>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {!companyId ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            Select a company first.
          </div>
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-black">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-600 dark:text-zinc-300">
            {loading ? "Loading…" : "No sessions yet. Start scanning!"}
          </div>
        ) : (
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {rows.map((r) => (
              <li key={r.session.id} className="px-4 py-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                      {r.session.title}{" "}
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        • {r.session.day_key}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                      {r.total} item(s) • {r.uploaded} uploaded • {r.queued} pending • {r.errors} error(s)
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/app/scan/sessions/${r.session.id}`}
                      className="inline-flex h-10 items-center justify-center rounded-full bg-amber-600 px-5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
                    >
                      Review checklist
                    </Link>
                    <button
                      onClick={() => void archiveEmpty(r.session.id)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
                    >
                      Archive
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

