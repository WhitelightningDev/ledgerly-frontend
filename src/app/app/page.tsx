"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getApiUrl } from "../_lib/apiUrl";

function formatMoney(currency: string, amount: number | null) {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const DEFAULT_CCY = "ZAR";

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

type ApiError = { detail?: string };

type ActivityItem = {
  created_at: string;
  action: string;
  receipt_id: string;
  vendor: string | null;
  status: string;
  total_amount: number | null;
};

type DashboardStats = {
  needs_review_count: number;
  posted_month_count: number;
  posted_month_total: number;
  failed_post_count: number;
  receipts_uploaded_month_count: number;
  invoices_needs_review_count: number;
  invoices_uploaded_month_count: number;
  invoices_month_total: number;
  recent_activity: ActivityItem[];
};

export default function AppHomePage() {
  const apiUrl = useMemo(() => getApiUrl(), []);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchStats() {
    const token = getToken();
    const companyId = getCompanyId();
    if (!token || !companyId) {
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/stats/dashboard?company_id=${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as DashboardStats | ApiError;
      if (!res.ok) throw new Error((data as ApiError).detail || "Failed to load stats.");
      if (!("needs_review_count" in data)) throw new Error("Unexpected API response.");
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats.");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }

  async function deleteReceipt(receiptId: string) {
    const token = getToken();
    const companyId = getCompanyId();
    if (!token || !companyId) return;

    const ok = window.confirm("Delete this receipt? This cannot be undone.");
    if (!ok) return;

    setDeletingId(receiptId);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/receipts/${receiptId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json()) as { status?: string } | ApiError;
      if (!res.ok) {
        throw new Error((body as ApiError).detail || "Delete failed.");
      }
      await fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    void fetchStats();
    function onCompanyChanged() {
      void fetchStats();
    }
    window.addEventListener("ledgerly:companyChanged", onCompanyChanged);
    return () =>
      window.removeEventListener("ledgerly:companyChanged", onCompanyChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  return (
    <main className="w-full px-4 py-10 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Inbox → extract → approve → post → audit trail.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.dispatchEvent(new Event("ledgerly:upload"))}
            className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Upload document
          </button>
          <Link
            href="/app/integrations"
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            Connect Sage
          </Link>
          <Link
            href="/app/inbox"
            className="inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:hover:bg-white/5"
          >
            View inbox
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {!getCompanyId() ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            No company selected
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Create a company in onboarding to start uploading receipts.
          </p>
          <div className="mt-5">
            <Link
              href="/onboarding"
              className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Go to onboarding
            </Link>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <StatCard
          title="Money out needing review"
          value={loading || !stats ? "—" : String(stats.needs_review_count)}
          href="/app/approvals"
          hint="Open approval queue"
        />
        <StatCard
          title="Money in needing review"
          value={loading || !stats ? "—" : String(stats.invoices_needs_review_count)}
          href="/app/invoices"
          hint="Open invoices"
        />
        <StatCard
          title="Money out this month"
          value={
            loading || !stats
              ? "—"
              : `${stats.posted_month_count} • ${formatMoney(DEFAULT_CCY, stats.posted_month_total)}`
          }
          href="/app/transactions"
          hint="View posted receipts"
        />
        <StatCard
          title="Money in this month"
          value={
            loading || !stats
              ? "—"
              : `${stats.invoices_uploaded_month_count} • ${formatMoney(DEFAULT_CCY, stats.invoices_month_total)}`
          }
          href="/app/invoices"
          hint="View invoices"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <MoneyFlowChartCard
          loading={loading || !stats}
          moneyIn={stats?.invoices_month_total ?? 0}
          moneyOut={stats?.posted_month_total ?? 0}
        />
        <div className="lg:col-span-2" />
      </div>

      {stats && stats.failed_post_count > 0 ? (
        <div className="mt-4">
          <AlertCard
            title="Failed posts"
            value={loading || !stats ? "—" : String(stats.failed_post_count)}
            href="/app/inbox?status=post_failed"
          />
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
            Recent activity
          </div>
          <button
            onClick={() => void fetchStats()}
            className="text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
          {loading && !stats ? (
            <div className="text-zinc-600 dark:text-zinc-400">Loading…</div>
          ) : stats?.recent_activity?.length ? (
            stats.recent_activity.map((e) => (
              <Link
                key={`${e.receipt_id}:${e.created_at}:${e.action}`}
                href={`/app/inbox/${e.receipt_id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/5 bg-zinc-50 px-4 py-3 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <div className="min-w-0">
                  <div className="font-medium text-zinc-950 dark:text-zinc-50">
                    {e.action} • {e.vendor || "Unknown merchant"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {new Date(e.created_at).toLocaleString()} • {e.status}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {formatMoney(DEFAULT_CCY, e.total_amount)}
                  </div>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      void deleteReceipt(e.receipt_id);
                    }}
                    disabled={deletingId === e.receipt_id}
                    className="inline-flex h-8 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 px-3 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/15 disabled:opacity-60 dark:text-red-300"
                    title="Delete receipt"
                  >
                    {deletingId === e.receipt_id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </Link>
            ))
          ) : (
            <div className="text-zinc-600 dark:text-zinc-400">
              No activity yet. Upload a receipt to get started.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatCard({
  title,
  value,
  href,
  hint,
}: {
  title: string;
  value: string;
  href: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-5">
        <Link href={href} className="text-sm font-medium underline">
          {hint}
        </Link>
      </div>
    </div>
  );
}

function AlertCard({
  title,
  value,
  href,
}: {
  title: string;
  value: string;
  href: string;
}) {
  const hasFailures = value !== "—" && value !== "0";
  return (
    <div
      className={[
        "rounded-2xl border p-6 shadow-sm",
        hasFailures
          ? "border-red-500/20 bg-red-500/5"
          : "border-black/10 bg-white dark:border-white/10 dark:bg-black",
      ].join(" ")}
    >
      <div
        className={[
          "text-sm font-medium",
          hasFailures
            ? "text-red-700 dark:text-red-300"
            : "text-zinc-600 dark:text-zinc-300",
        ].join(" ")}
      >
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-5">
        <Link href={href} className="text-sm font-medium underline">
          View failed posts
        </Link>
      </div>
    </div>
  );
}

function MoneyFlowChartCard({
  loading,
  moneyIn,
  moneyOut,
}: {
  loading: boolean;
  moneyIn: number;
  moneyOut: number;
}) {
  const safeIn = Number.isFinite(moneyIn) ? Math.max(0, moneyIn) : 0;
  const safeOut = Number.isFinite(moneyOut) ? Math.max(0, moneyOut) : 0;
  const max = Math.max(safeIn, safeOut, 1);

  const inPct = Math.round((safeIn / max) * 100);
  const outPct = Math.round((safeOut / max) * 100);

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Money in vs money out (this month)
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">Total</div>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">—</div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="font-medium text-zinc-950 dark:text-zinc-50">
                Money in
              </div>
              <div className="text-zinc-600 dark:text-zinc-300">
                {formatMoney(DEFAULT_CCY, safeIn)}
              </div>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${inPct}%` }}
                aria-label={`Money in bar: ${inPct}%`}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="font-medium text-zinc-950 dark:text-zinc-50">
                Money out
              </div>
              <div className="text-zinc-600 dark:text-zinc-300">
                {formatMoney(DEFAULT_CCY, safeOut)}
              </div>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-amber-600"
                style={{ width: `${outPct}%` }}
                aria-label={`Money out bar: ${outPct}%`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
